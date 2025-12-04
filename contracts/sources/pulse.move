/// PULSE Token module for MVPulse dApp
/// A fungible token with a max supply of 1 billion PULSE
module contracts::pulse {
    use std::string;
    use std::signer;
    use aptos_framework::coin::{Self, MintCapability, BurnCapability};

    /// Max supply: 1 billion PULSE (with 8 decimals = 100_000_000_000_000_000)
    const MAX_SUPPLY: u64 = 100_000_000_000_000_000;

    /// Error codes
    const E_NOT_ADMIN: u64 = 1;
    const E_EXCEEDS_MAX_SUPPLY: u64 = 2;
    const E_ALREADY_INITIALIZED: u64 = 3;

    /// The PULSE token marker struct
    struct PULSE has key {}

    /// Capabilities for minting and burning
    struct Capabilities has key {
        mint_cap: MintCapability<PULSE>,
        burn_cap: BurnCapability<PULSE>,
        total_minted: u64,
    }

    /// Initialize PULSE token (one-time setup by deployer)
    public entry fun initialize(account: &signer) {
        let deployer_addr = signer::address_of(account);
        assert!(!exists<Capabilities>(deployer_addr), E_ALREADY_INITIALIZED);

        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<PULSE>(
            account,
            string::utf8(b"Pulse Token"),
            string::utf8(b"PULSE"),
            8,  // decimals (same as MOVE)
            true, // monitor_supply
        );

        // Destroy freeze capability - tokens cannot be frozen
        coin::destroy_freeze_cap(freeze_cap);

        move_to(account, Capabilities {
            mint_cap,
            burn_cap,
            total_minted: 0,
        });
    }

    /// Mint PULSE tokens (admin only, enforces max supply of 1 billion)
    public entry fun mint(
        account: &signer,
        recipient: address,
        amount: u64
    ) acquires Capabilities {
        let deployer_addr = @contracts;
        assert!(signer::address_of(account) == deployer_addr, E_NOT_ADMIN);

        let caps = borrow_global_mut<Capabilities>(deployer_addr);
        assert!(caps.total_minted + amount <= MAX_SUPPLY, E_EXCEEDS_MAX_SUPPLY);

        let coins = coin::mint(amount, &caps.mint_cap);
        coin::deposit(recipient, coins);
        caps.total_minted = caps.total_minted + amount;
    }

    /// Register account for PULSE (users must call before receiving)
    public entry fun register(account: &signer) {
        coin::register<PULSE>(account);
    }

    /// Burn PULSE tokens (holder can burn their own tokens)
    public entry fun burn(
        account: &signer,
        amount: u64
    ) acquires Capabilities {
        let coins = coin::withdraw<PULSE>(account, amount);
        let caps = borrow_global<Capabilities>(@contracts);
        coin::burn(coins, &caps.burn_cap);
    }

    #[view]
    /// Get total amount of PULSE minted so far
    public fun total_minted(): u64 acquires Capabilities {
        borrow_global<Capabilities>(@contracts).total_minted
    }

    #[view]
    /// Get the maximum supply of PULSE
    public fun max_supply(): u64 {
        MAX_SUPPLY
    }

    #[view]
    /// Get remaining mintable supply
    public fun remaining_supply(): u64 acquires Capabilities {
        MAX_SUPPLY - borrow_global<Capabilities>(@contracts).total_minted
    }
}
