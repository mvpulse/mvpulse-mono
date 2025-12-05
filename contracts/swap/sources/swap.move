/// Swap module for PULSE/Stablecoin AMM trading
/// Both PULSE and stablecoin (USDC.e) use Fungible Asset standard
/// Implements constant product (x*y=k) automated market maker
module swap::swap {
    use std::signer;
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleStore};
    use aptos_framework::primary_fungible_store;
    use pulse::pulse;

    /// Error codes
    const E_NOT_ADMIN: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_INITIALIZED: u64 = 3;
    const E_INSUFFICIENT_LIQUIDITY: u64 = 4;
    const E_INSUFFICIENT_INPUT_AMOUNT: u64 = 5;
    const E_INSUFFICIENT_OUTPUT_AMOUNT: u64 = 6;
    const E_INVALID_FEE: u64 = 7;
    const E_SLIPPAGE_EXCEEDED: u64 = 8;
    const E_ZERO_LIQUIDITY: u64 = 9;
    const E_INSUFFICIENT_LP_BALANCE: u64 = 10;
    const E_K_INVARIANT_VIOLATED: u64 = 11;

    /// Fee constants
    const MAX_FEE_BPS: u64 = 500;       // Max 5% fee
    const DEFAULT_FEE_BPS: u64 = 30;    // Default 0.3% fee
    const BPS_DENOMINATOR: u64 = 10000;

    /// Minimum liquidity locked forever to prevent division by zero
    const MINIMUM_LIQUIDITY: u64 = 1000;

    /// Liquidity Pool state for PULSE FA / Stablecoin FA
    struct LiquidityPool has key {
        pulse_store: Object<FungibleStore>,    // FA store for PULSE
        pulse_store_extend_ref: ExtendRef,     // ExtendRef to generate signer for PULSE store
        pulse_metadata: Object<Metadata>,       // PULSE metadata
        stable_store: Object<FungibleStore>,   // FA store for stablecoin
        stable_store_extend_ref: ExtendRef,    // ExtendRef to generate signer for stable store
        stable_metadata: Object<Metadata>,      // Stablecoin metadata (USDC.e)
        total_lp_shares: u64,
        fee_bps: u64,
        admin: address,
    }

    /// LP position for each liquidity provider
    struct LPPosition has key {
        shares: u64,
    }

    // ==================== Events ====================

    #[event]
    struct PoolInitialized has drop, store {
        admin: address,
        fee_bps: u64,
        pulse_metadata: address,
        stable_metadata: address,
    }

    #[event]
    struct LiquidityAdded has drop, store {
        provider: address,
        pulse_amount: u64,
        stable_amount: u64,
        lp_shares_minted: u64,
    }

    #[event]
    struct LiquidityRemoved has drop, store {
        provider: address,
        pulse_amount: u64,
        stable_amount: u64,
        lp_shares_burned: u64,
    }

    #[event]
    struct Swap has drop, store {
        trader: address,
        pulse_in: u64,
        stable_in: u64,
        pulse_out: u64,
        stable_out: u64,
        fee_amount: u64,
    }

    #[event]
    struct FeeUpdated has drop, store {
        old_fee_bps: u64,
        new_fee_bps: u64,
    }

    // ==================== Admin Functions ====================

    /// Initialize the liquidity pool (admin only, one-time)
    /// stable_metadata_addr is the FA metadata address (e.g., USDC.e address)
    public entry fun initialize(
        account: &signer,
        stable_metadata_addr: address,
        fee_bps: u64
    ) {
        let admin = signer::address_of(account);
        assert!(admin == @swap, E_NOT_ADMIN);
        assert!(!exists<LiquidityPool>(@swap), E_ALREADY_INITIALIZED);
        assert!(fee_bps <= MAX_FEE_BPS, E_INVALID_FEE);

        // Get PULSE metadata from the pulse module
        let pulse_metadata = pulse::get_metadata();
        let pulse_metadata_addr = pulse::get_metadata_address();

        // Get the stablecoin FA metadata object
        let stable_metadata = object::address_to_object<Metadata>(stable_metadata_addr);

        // Create fungible stores for both tokens with ExtendRef for withdrawals
        let pulse_constructor_ref = object::create_object(admin);
        let pulse_store = fungible_asset::create_store(&pulse_constructor_ref, pulse_metadata);
        let pulse_store_extend_ref = object::generate_extend_ref(&pulse_constructor_ref);

        let stable_constructor_ref = object::create_object(admin);
        let stable_store = fungible_asset::create_store(&stable_constructor_ref, stable_metadata);
        let stable_store_extend_ref = object::generate_extend_ref(&stable_constructor_ref);

        let pool = LiquidityPool {
            pulse_store,
            pulse_store_extend_ref,
            pulse_metadata,
            stable_store,
            stable_store_extend_ref,
            stable_metadata,
            total_lp_shares: 0,
            fee_bps,
            admin,
        };

        move_to(account, pool);

        event::emit(PoolInitialized {
            admin,
            fee_bps,
            pulse_metadata: pulse_metadata_addr,
            stable_metadata: stable_metadata_addr,
        });
    }

    /// Update swap fee (admin only)
    public entry fun set_fee(
        account: &signer,
        new_fee_bps: u64
    ) acquires LiquidityPool {
        let caller = signer::address_of(account);
        let pool = borrow_global_mut<LiquidityPool>(@swap);

        assert!(caller == pool.admin, E_NOT_ADMIN);
        assert!(new_fee_bps <= MAX_FEE_BPS, E_INVALID_FEE);

        let old_fee = pool.fee_bps;
        pool.fee_bps = new_fee_bps;

        event::emit(FeeUpdated { old_fee_bps: old_fee, new_fee_bps });
    }

    /// Transfer admin role
    public entry fun transfer_admin(
        account: &signer,
        new_admin: address
    ) acquires LiquidityPool {
        let caller = signer::address_of(account);
        let pool = borrow_global_mut<LiquidityPool>(@swap);

        assert!(caller == pool.admin, E_NOT_ADMIN);
        pool.admin = new_admin;
    }

    // ==================== Liquidity Functions ====================

    /// Add liquidity to the pool
    public entry fun add_liquidity(
        account: &signer,
        pulse_amount: u64,
        stable_amount: u64,
        min_lp_shares: u64
    ) acquires LiquidityPool, LPPosition {
        let provider = signer::address_of(account);
        let pool = borrow_global_mut<LiquidityPool>(@swap);

        let pulse_reserve = fungible_asset::balance(pool.pulse_store);
        let stable_reserve = fungible_asset::balance(pool.stable_store);

        let lp_shares: u64;

        if (pool.total_lp_shares == 0) {
            // First liquidity provision - use geometric mean
            lp_shares = sqrt((pulse_amount as u128) * (stable_amount as u128)) - MINIMUM_LIQUIDITY;
            // Lock minimum liquidity forever
            pool.total_lp_shares = MINIMUM_LIQUIDITY;
        } else {
            // Calculate shares based on the ratio that gives fewer shares
            let shares_from_pulse = ((pulse_amount as u128) * (pool.total_lp_shares as u128) / (pulse_reserve as u128) as u64);
            let shares_from_stable = ((stable_amount as u128) * (pool.total_lp_shares as u128) / (stable_reserve as u128) as u64);
            lp_shares = if (shares_from_pulse < shares_from_stable) {
                shares_from_pulse
            } else {
                shares_from_stable
            };
        };

        assert!(lp_shares >= min_lp_shares, E_SLIPPAGE_EXCEEDED);
        assert!(lp_shares > 0, E_ZERO_LIQUIDITY);

        // Transfer PULSE (FA) to pool
        let pulse_fa = primary_fungible_store::withdraw(account, pool.pulse_metadata, pulse_amount);
        fungible_asset::deposit(pool.pulse_store, pulse_fa);

        // Transfer stablecoin (FA) to pool
        let stable_fa = primary_fungible_store::withdraw(account, pool.stable_metadata, stable_amount);
        fungible_asset::deposit(pool.stable_store, stable_fa);

        pool.total_lp_shares = pool.total_lp_shares + lp_shares;

        // Update or create LP position
        if (!exists<LPPosition>(provider)) {
            move_to(account, LPPosition { shares: lp_shares });
        } else {
            let position = borrow_global_mut<LPPosition>(provider);
            position.shares = position.shares + lp_shares;
        };

        event::emit(LiquidityAdded {
            provider,
            pulse_amount,
            stable_amount,
            lp_shares_minted: lp_shares,
        });
    }

    /// Remove liquidity from the pool
    public entry fun remove_liquidity(
        account: &signer,
        lp_shares: u64,
        min_pulse_out: u64,
        min_stable_out: u64
    ) acquires LiquidityPool, LPPosition {
        let provider = signer::address_of(account);

        // Verify LP position
        assert!(exists<LPPosition>(provider), E_INSUFFICIENT_LP_BALANCE);
        let position = borrow_global_mut<LPPosition>(provider);
        assert!(position.shares >= lp_shares, E_INSUFFICIENT_LP_BALANCE);

        let pool = borrow_global_mut<LiquidityPool>(@swap);

        let pulse_reserve = fungible_asset::balance(pool.pulse_store);
        let stable_reserve = fungible_asset::balance(pool.stable_store);

        // Calculate token amounts to return
        let pulse_out = ((lp_shares as u128) * (pulse_reserve as u128) / (pool.total_lp_shares as u128) as u64);
        let stable_out = ((lp_shares as u128) * (stable_reserve as u128) / (pool.total_lp_shares as u128) as u64);

        assert!(pulse_out >= min_pulse_out, E_SLIPPAGE_EXCEEDED);
        assert!(stable_out >= min_stable_out, E_SLIPPAGE_EXCEEDED);

        // Update state
        position.shares = position.shares - lp_shares;
        pool.total_lp_shares = pool.total_lp_shares - lp_shares;

        // Generate signers for pool stores using ExtendRef
        let pulse_store_signer = object::generate_signer_for_extending(&pool.pulse_store_extend_ref);
        let stable_store_signer = object::generate_signer_for_extending(&pool.stable_store_extend_ref);

        // Transfer PULSE (FA) to provider using pool store's signer
        let pulse_fa = fungible_asset::withdraw(&pulse_store_signer, pool.pulse_store, pulse_out);
        primary_fungible_store::deposit(provider, pulse_fa);

        // Transfer stablecoin (FA) to provider using pool store's signer
        let stable_fa = fungible_asset::withdraw(&stable_store_signer, pool.stable_store, stable_out);
        primary_fungible_store::deposit(provider, stable_fa);

        event::emit(LiquidityRemoved {
            provider,
            pulse_amount: pulse_out,
            stable_amount: stable_out,
            lp_shares_burned: lp_shares,
        });
    }

    // ==================== Swap Functions ====================

    /// Swap PULSE for Stablecoin (sell PULSE)
    public entry fun swap_pulse_to_stable(
        account: &signer,
        pulse_amount_in: u64,
        min_stable_out: u64
    ) acquires LiquidityPool {
        let trader = signer::address_of(account);
        let pool = borrow_global_mut<LiquidityPool>(@swap);

        let pulse_reserve = fungible_asset::balance(pool.pulse_store);
        let stable_reserve = fungible_asset::balance(pool.stable_store);

        assert!(pulse_reserve > 0 && stable_reserve > 0, E_INSUFFICIENT_LIQUIDITY);
        assert!(pulse_amount_in > 0, E_INSUFFICIENT_INPUT_AMOUNT);

        // Calculate output using x*y=k formula with fee
        let amount_in_with_fee = (pulse_amount_in as u128) * ((BPS_DENOMINATOR - pool.fee_bps) as u128);
        let numerator = (stable_reserve as u128) * amount_in_with_fee;
        let denominator = (pulse_reserve as u128) * (BPS_DENOMINATOR as u128) + amount_in_with_fee;
        let stable_out = (numerator / denominator as u64);

        assert!(stable_out >= min_stable_out, E_SLIPPAGE_EXCEEDED);
        assert!(stable_out > 0, E_INSUFFICIENT_OUTPUT_AMOUNT);

        let fee_amount = (pulse_amount_in * pool.fee_bps) / BPS_DENOMINATOR;

        // Verify k invariant (new_k >= old_k)
        let new_pulse_reserve = pulse_reserve + pulse_amount_in;
        let new_stable_reserve = stable_reserve - stable_out;
        assert!(
            (new_pulse_reserve as u128) * (new_stable_reserve as u128) >=
            (pulse_reserve as u128) * (stable_reserve as u128),
            E_K_INVARIANT_VIOLATED
        );

        // Execute swap - PULSE in (FA) from user
        let pulse_in = primary_fungible_store::withdraw(account, pool.pulse_metadata, pulse_amount_in);
        fungible_asset::deposit(pool.pulse_store, pulse_in);

        // Generate signer for pool's stable store using ExtendRef
        let stable_store_signer = object::generate_signer_for_extending(&pool.stable_store_extend_ref);

        // Stablecoin out (FA) from pool to user
        let stable_out_fa = fungible_asset::withdraw(&stable_store_signer, pool.stable_store, stable_out);
        primary_fungible_store::deposit(trader, stable_out_fa);

        event::emit(Swap {
            trader,
            pulse_in: pulse_amount_in,
            stable_in: 0,
            pulse_out: 0,
            stable_out,
            fee_amount,
        });
    }

    /// Swap Stablecoin for PULSE (buy PULSE)
    public entry fun swap_stable_to_pulse(
        account: &signer,
        stable_amount_in: u64,
        min_pulse_out: u64
    ) acquires LiquidityPool {
        let trader = signer::address_of(account);
        let pool = borrow_global_mut<LiquidityPool>(@swap);

        let pulse_reserve = fungible_asset::balance(pool.pulse_store);
        let stable_reserve = fungible_asset::balance(pool.stable_store);

        assert!(pulse_reserve > 0 && stable_reserve > 0, E_INSUFFICIENT_LIQUIDITY);
        assert!(stable_amount_in > 0, E_INSUFFICIENT_INPUT_AMOUNT);

        // Calculate output using x*y=k formula with fee
        let amount_in_with_fee = (stable_amount_in as u128) * ((BPS_DENOMINATOR - pool.fee_bps) as u128);
        let numerator = (pulse_reserve as u128) * amount_in_with_fee;
        let denominator = (stable_reserve as u128) * (BPS_DENOMINATOR as u128) + amount_in_with_fee;
        let pulse_out = (numerator / denominator as u64);

        assert!(pulse_out >= min_pulse_out, E_SLIPPAGE_EXCEEDED);
        assert!(pulse_out > 0, E_INSUFFICIENT_OUTPUT_AMOUNT);

        let fee_amount = (stable_amount_in * pool.fee_bps) / BPS_DENOMINATOR;

        // Verify k invariant
        let new_stable_reserve = stable_reserve + stable_amount_in;
        let new_pulse_reserve = pulse_reserve - pulse_out;
        assert!(
            (new_pulse_reserve as u128) * (new_stable_reserve as u128) >=
            (pulse_reserve as u128) * (stable_reserve as u128),
            E_K_INVARIANT_VIOLATED
        );

        // Execute swap - Stablecoin in (FA) from user
        let stable_in = primary_fungible_store::withdraw(account, pool.stable_metadata, stable_amount_in);
        fungible_asset::deposit(pool.stable_store, stable_in);

        // Generate signer for pool's PULSE store using ExtendRef
        let pulse_store_signer = object::generate_signer_for_extending(&pool.pulse_store_extend_ref);

        // PULSE out (FA) from pool to user
        let pulse_out_fa = fungible_asset::withdraw(&pulse_store_signer, pool.pulse_store, pulse_out);
        primary_fungible_store::deposit(trader, pulse_out_fa);

        event::emit(Swap {
            trader,
            pulse_in: 0,
            stable_in: stable_amount_in,
            pulse_out,
            stable_out: 0,
            fee_amount,
        });
    }

    // ==================== View Functions ====================

    #[view]
    /// Get pool reserves
    public fun get_reserves(): (u64, u64) acquires LiquidityPool {
        if (!exists<LiquidityPool>(@swap)) {
            return (0, 0)
        };
        let pool = borrow_global<LiquidityPool>(@swap);
        (fungible_asset::balance(pool.pulse_store), fungible_asset::balance(pool.stable_store))
    }

    #[view]
    /// Get pool info (reserves, total shares, fee)
    public fun get_pool_info(): (u64, u64, u64, u64) acquires LiquidityPool {
        if (!exists<LiquidityPool>(@swap)) {
            return (0, 0, 0, 0)
        };
        let pool = borrow_global<LiquidityPool>(@swap);
        (
            fungible_asset::balance(pool.pulse_store),
            fungible_asset::balance(pool.stable_store),
            pool.total_lp_shares,
            pool.fee_bps
        )
    }

    #[view]
    /// Get LP position for an address
    public fun get_lp_position(provider: address): u64 acquires LPPosition {
        if (exists<LPPosition>(provider)) {
            borrow_global<LPPosition>(provider).shares
        } else {
            0
        }
    }

    #[view]
    /// Calculate output amount for a swap (quote function)
    public fun get_amount_out(
        amount_in: u64,
        is_pulse_to_stable: bool
    ): u64 acquires LiquidityPool {
        if (!exists<LiquidityPool>(@swap)) {
            return 0
        };
        let pool = borrow_global<LiquidityPool>(@swap);
        let pulse_reserve = fungible_asset::balance(pool.pulse_store);
        let stable_reserve = fungible_asset::balance(pool.stable_store);

        if (pulse_reserve == 0 || stable_reserve == 0) {
            return 0
        };

        if (is_pulse_to_stable) {
            let amount_in_with_fee = (amount_in as u128) * ((BPS_DENOMINATOR - pool.fee_bps) as u128);
            let numerator = (stable_reserve as u128) * amount_in_with_fee;
            let denominator = (pulse_reserve as u128) * (BPS_DENOMINATOR as u128) + amount_in_with_fee;
            (numerator / denominator as u64)
        } else {
            let amount_in_with_fee = (amount_in as u128) * ((BPS_DENOMINATOR - pool.fee_bps) as u128);
            let numerator = (pulse_reserve as u128) * amount_in_with_fee;
            let denominator = (stable_reserve as u128) * (BPS_DENOMINATOR as u128) + amount_in_with_fee;
            (numerator / denominator as u64)
        }
    }

    #[view]
    /// Calculate price impact for a swap (in basis points)
    public fun get_price_impact(
        amount_in: u64,
        is_pulse_to_stable: bool
    ): u64 acquires LiquidityPool {
        if (!exists<LiquidityPool>(@swap)) {
            return 0
        };
        let pool = borrow_global<LiquidityPool>(@swap);
        let pulse_reserve = fungible_asset::balance(pool.pulse_store);
        let stable_reserve = fungible_asset::balance(pool.stable_store);

        if (pulse_reserve == 0 || stable_reserve == 0 || amount_in == 0) {
            return 0
        };

        // Calculate spot price (scaled by BPS for precision)
        let spot_price_bps: u128 = if (is_pulse_to_stable) {
            (stable_reserve as u128) * (BPS_DENOMINATOR as u128) / (pulse_reserve as u128)
        } else {
            (pulse_reserve as u128) * (BPS_DENOMINATOR as u128) / (stable_reserve as u128)
        };

        // Get actual output
        let amount_out = get_amount_out(amount_in, is_pulse_to_stable);
        if (amount_out == 0) {
            return BPS_DENOMINATOR // 100% impact if no output
        };

        // Calculate execution price
        let exec_price_bps: u128 = (amount_out as u128) * (BPS_DENOMINATOR as u128) / (amount_in as u128);

        // Price impact = (spot - exec) / spot * 10000
        if (spot_price_bps > exec_price_bps) {
            (((spot_price_bps - exec_price_bps) * (BPS_DENOMINATOR as u128) / spot_price_bps) as u64)
        } else {
            0
        }
    }

    #[view]
    /// Get current spot price (PULSE per Stablecoin, scaled by 1e8)
    public fun get_spot_price(): u64 acquires LiquidityPool {
        if (!exists<LiquidityPool>(@swap)) {
            return 0
        };
        let pool = borrow_global<LiquidityPool>(@swap);
        let pulse_reserve = fungible_asset::balance(pool.pulse_store);
        let stable_reserve = fungible_asset::balance(pool.stable_store);

        if (pulse_reserve == 0 || stable_reserve == 0) {
            return 0
        };

        // Returns how many PULSE you get per 1 Stablecoin (scaled by 1e8)
        ((pulse_reserve as u128) * 100000000 / (stable_reserve as u128) as u64)
    }

    #[view]
    /// Check if pool is initialized
    public fun is_initialized(): bool {
        exists<LiquidityPool>(@swap)
    }

    #[view]
    /// Get stable metadata address
    public fun get_stable_metadata(): address acquires LiquidityPool {
        if (!exists<LiquidityPool>(@swap)) {
            return @0x0
        };
        let pool = borrow_global<LiquidityPool>(@swap);
        object::object_address(&pool.stable_metadata)
    }

    #[view]
    /// Get pulse metadata address
    public fun get_pulse_metadata(): address acquires LiquidityPool {
        if (!exists<LiquidityPool>(@swap)) {
            return @0x0
        };
        let pool = borrow_global<LiquidityPool>(@swap);
        object::object_address(&pool.pulse_metadata)
    }

    // ==================== Helper Functions ====================

    /// Integer square root (Babylonian method)
    fun sqrt(x: u128): u64 {
        if (x == 0) return 0;
        let z = (x + 1) / 2;
        let y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        };
        (y as u64)
    }
}
