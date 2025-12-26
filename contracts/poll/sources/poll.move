/// Poll module for MovePoll dApp
/// Allows creating polls, voting, and distributing rewards
/// Supports MOVE (legacy coin) and any Fungible Asset (PULSE, USDC, etc.)
module poll::poll {
    use std::string::String;
    use std::vector;
    use std::signer;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::object::{Self, Object, ExtendRef};
    use aptos_framework::fungible_asset::{Self, Metadata, FungibleStore};
    use aptos_framework::primary_fungible_store;
    use aptos_std::smart_table::{Self, SmartTable};
    use pulse::pulse;

    /// Error codes
    const E_NOT_OWNER: u64 = 1;
    const E_POLL_NOT_FOUND: u64 = 2;
    const E_POLL_CLOSED: u64 = 3;
    const E_ALREADY_VOTED: u64 = 4;
    const E_INVALID_OPTION: u64 = 5;
    const E_POLL_NOT_ENDED: u64 = 6;
    const E_ALREADY_CLAIMED: u64 = 7;
    const E_NOT_VOTER: u64 = 8;
    const E_POLL_NOT_CLAIMABLE: u64 = 9;
    const E_INSUFFICIENT_FUNDS: u64 = 10;
    const E_INVALID_DISTRIBUTION_MODE: u64 = 11;
    const E_REWARDS_ALREADY_DISTRIBUTED: u64 = 12;
    const E_MAX_VOTERS_REACHED: u64 = 13;
    const E_REWARD_POOL_EXHAUSTED: u64 = 14;
    const E_INVALID_FEE: u64 = 15;
    const E_NOT_ADMIN: u64 = 16;
    const E_DISTRIBUTION_MODE_NOT_SET: u64 = 17;
    const E_INVALID_COIN_TYPE: u64 = 18;
    const E_COIN_TYPE_MISMATCH: u64 = 19;
    const E_CLAIM_PERIOD_NOT_ELAPSED: u64 = 20;
    const E_POLL_ALREADY_FINALIZED: u64 = 21;
    const E_POLL_NOT_IN_CLAIMING: u64 = 22;
    const E_FA_VAULT_NOT_INITIALIZED: u64 = 23;

    /// Poll status
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_CLOSED: u8 = 1;
    const STATUS_CLAIMING_OR_DISTRIBUTION: u8 = 2;  // Poll closed - awaiting claims (MANUAL_PULL) or distribution (MANUAL_PUSH)
    const STATUS_FINALIZED: u8 = 3; // Poll is finalized, no more claims/distributions allowed

    /// Distribution modes
    const DISTRIBUTION_UNSET: u8 = 255;       // Not yet selected
    const DISTRIBUTION_MANUAL_PULL: u8 = 0;   // Participants manually claim rewards
    const DISTRIBUTION_MANUAL_PUSH: u8 = 1;   // Creator triggers distribution to all

    /// Coin type identifiers
    const COIN_TYPE_APTOS: u8 = 0;    // AptosCoin (MOVE) - legacy coin
    const COIN_TYPE_PULSE: u8 = 1;    // PULSE token - Fungible Asset
    const COIN_TYPE_USDC: u8 = 2;     // USDC token - Fungible Asset

    /// Fee constants
    const MAX_FEE_BPS: u64 = 1000;  // Max 10% fee
    const DEFAULT_FEE_BPS: u64 = 200;  // Default 2% fee

    /// Claim period constants
    const DEFAULT_CLAIM_PERIOD_SECS: u64 = 604800;  // Default 7 days in seconds

    /// Represents a single poll
    struct Poll has store, drop, copy {
        id: u64,
        creator: address,
        title: String,
        description: String,
        options: vector<String>,
        votes: vector<u64>,
        voters: vector<address>,
        reward_per_vote: u64,         // Fixed amount per voter (0 = equal split mode)
        reward_pool: u64,             // Net funds after platform fee
        max_voters: u64,              // Maximum voters allowed (0 = unlimited, but only for fixed mode)
        distribution_mode: u8,        // 255 = unset (selected at close time)
        claimed: vector<address>,
        rewards_distributed: bool,
        end_time: u64,
        status: u8,
        coin_type_id: u8,             // 0 = AptosCoin, 1 = PULSE, 2 = USDC
        closed_at: u64,               // Timestamp when poll entered CLAIMING status (for claim period calculation)
        fa_metadata_address: address, // For FA tokens: the metadata address (0x0 for legacy coins)
    }

    /// Global poll registry stored at contract address
    struct PollRegistry has key {
        polls: vector<Poll>,
        next_id: u64,
        admin: address,               // Admin address (can update fees)
        platform_fee_bps: u64,        // Fee in basis points (100 = 1%)
        platform_treasury: address,   // Address to receive fees
        total_fees_collected: u64,    // Track total fees collected
        claim_period_secs: u64,       // Time period for claiming rewards after poll closes
    }

    /// Reward vault for legacy coins (AptosCoin/MOVE)
    struct RewardVault<phantom CoinType> has key {
        coins: coin::Coin<CoinType>,
    }

    /// Generic reward vault for any Fungible Asset
    /// Maps FA metadata address to fungible stores
    struct GenericFAVault has key {
        stores: SmartTable<address, Object<FungibleStore>>,
        extend_ref: ExtendRef,
    }

    #[event]
    /// Event emitted when a poll is created
    struct PollCreated has drop, store {
        poll_id: u64,
        creator: address,
        title: String,
        reward_pool: u64,
        max_voters: u64,
        platform_fee: u64,
        coin_type_id: u8,
    }

    #[event]
    struct VoteCast has drop, store {
        poll_id: u64,
        voter: address,
        option_index: u64,
    }

    #[event]
    struct PollClosed has drop, store {
        poll_id: u64,
        distribution_mode: u8,
        total_voters: u64,
    }

    #[event]
    struct RewardClaimed has drop, store {
        poll_id: u64,
        claimer: address,
        amount: u64,
    }

    #[event]
    struct RewardsDistributed has drop, store {
        poll_id: u64,
        total_distributed: u64,
        recipient_count: u64,
    }

    #[event]
    struct FeeUpdated has drop, store {
        old_fee_bps: u64,
        new_fee_bps: u64,
    }

    #[event]
    struct PollFinalized has drop, store {
        poll_id: u64,
        unclaimed_amount: u64,
        sent_to_treasury: bool,
    }

    #[event]
    struct ClaimPeriodUpdated has drop, store {
        old_period_secs: u64,
        new_period_secs: u64,
    }

    #[event]
    struct FAVaultInitialized has drop, store {
        metadata_address: address,
    }

    /// Initialize the poll registry (call once when deploying)
    /// Also initializes the AptosCoin vault and generic FA vault
    public entry fun initialize(account: &signer) {
        let admin_addr = signer::address_of(account);
        let registry = PollRegistry {
            polls: vector::empty(),
            next_id: 0,
            admin: admin_addr,
            platform_fee_bps: DEFAULT_FEE_BPS,
            platform_treasury: admin_addr,
            total_fees_collected: 0,
            claim_period_secs: DEFAULT_CLAIM_PERIOD_SECS,
        };
        move_to(account, registry);

        // Initialize the reward vault for AptosCoin (legacy coin)
        let vault = RewardVault<AptosCoin> {
            coins: coin::zero<AptosCoin>(),
        };
        move_to(account, vault);

        // Initialize the generic FA vault
        let constructor_ref = object::create_object(admin_addr);
        let extend_ref = object::generate_extend_ref(&constructor_ref);

        let fa_vault = GenericFAVault {
            stores: smart_table::new(),
            extend_ref,
        };
        move_to(account, fa_vault);
    }

    /// Initialize a store for a specific Fungible Asset in the generic vault
    /// Must be called before using that FA for polls
    public entry fun initialize_fa_store(
        account: &signer,
        registry_addr: address,
        fa_metadata_address: address,
    ) acquires PollRegistry, GenericFAVault {
        let registry = borrow_global<PollRegistry>(registry_addr);
        assert!(signer::address_of(account) == registry.admin, E_NOT_ADMIN);

        let fa_vault = borrow_global_mut<GenericFAVault>(registry_addr);

        // Check if store already exists
        if (!smart_table::contains(&fa_vault.stores, fa_metadata_address)) {
            let metadata = object::address_to_object<Metadata>(fa_metadata_address);
            let vault_signer = object::generate_signer_for_extending(&fa_vault.extend_ref);
            let constructor_ref = object::create_object(signer::address_of(&vault_signer));
            let store = fungible_asset::create_store(&constructor_ref, metadata);
            smart_table::add(&mut fa_vault.stores, fa_metadata_address, store);

            event::emit(FAVaultInitialized {
                metadata_address: fa_metadata_address,
            });
        };
    }

    /// Create a new poll with MOVE (AptosCoin) rewards
    public entry fun create_poll_with_move(
        account: &signer,
        registry_addr: address,
        title: String,
        description: String,
        options: vector<String>,
        reward_per_vote: u64,
        max_voters: u64,
        duration_secs: u64,
        fund_amount: u64,
    ) acquires PollRegistry, RewardVault {
        let creator = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        // Calculate and collect platform fee
        let reward_pool = 0u64;
        let platform_fee = 0u64;

        if (fund_amount > 0) {
            // Calculate fee
            platform_fee = (fund_amount * registry.platform_fee_bps) / 10000;
            let net_amount = fund_amount - platform_fee;

            // Transfer fee to treasury
            if (platform_fee > 0) {
                let fee_coins = coin::withdraw<AptosCoin>(account, platform_fee);
                coin::deposit(registry.platform_treasury, fee_coins);
                registry.total_fees_collected = registry.total_fees_collected + platform_fee;
            };

            // Transfer net amount to vault
            let vault = borrow_global_mut<RewardVault<AptosCoin>>(registry_addr);
            let payment = coin::withdraw<AptosCoin>(account, net_amount);
            coin::merge(&mut vault.coins, payment);
            reward_pool = net_amount;
        };

        create_poll_internal(
            registry,
            creator,
            title,
            description,
            options,
            reward_per_vote,
            max_voters,
            duration_secs,
            reward_pool,
            platform_fee,
            COIN_TYPE_APTOS,
            @0x0, // No FA metadata for legacy coins
        );
    }

    /// Create a new poll with any Fungible Asset rewards (PULSE, USDC, etc.)
    /// fa_metadata_address: The metadata address of the Fungible Asset
    /// coin_type_id: The coin type identifier (1 = PULSE, 2 = USDC, etc.)
    public entry fun create_poll_with_fa(
        account: &signer,
        registry_addr: address,
        title: String,
        description: String,
        options: vector<String>,
        reward_per_vote: u64,
        max_voters: u64,
        duration_secs: u64,
        fund_amount: u64,
        fa_metadata_address: address,
        coin_type_id: u8,
    ) acquires PollRegistry, GenericFAVault {
        let creator = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);
        let fa_vault = borrow_global_mut<GenericFAVault>(registry_addr);

        // Ensure the FA store is initialized
        assert!(smart_table::contains(&fa_vault.stores, fa_metadata_address), E_FA_VAULT_NOT_INITIALIZED);

        // Calculate and collect platform fee
        let reward_pool = 0u64;
        let platform_fee = 0u64;

        if (fund_amount > 0) {
            // Calculate fee
            platform_fee = (fund_amount * registry.platform_fee_bps) / 10000;
            let net_amount = fund_amount - platform_fee;

            let metadata = object::address_to_object<Metadata>(fa_metadata_address);

            // Transfer fee to treasury
            if (platform_fee > 0) {
                let fee_fa = primary_fungible_store::withdraw(account, metadata, platform_fee);
                primary_fungible_store::deposit(registry.platform_treasury, fee_fa);
                registry.total_fees_collected = registry.total_fees_collected + platform_fee;
            };

            // Transfer net amount to FA vault
            let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
            let payment = primary_fungible_store::withdraw(account, metadata, net_amount);
            fungible_asset::deposit(*store, payment);
            reward_pool = net_amount;
        };

        create_poll_internal(
            registry,
            creator,
            title,
            description,
            options,
            reward_per_vote,
            max_voters,
            duration_secs,
            reward_pool,
            platform_fee,
            coin_type_id,
            fa_metadata_address,
        );
    }

    /// Internal function to create a poll (shared logic)
    fun create_poll_internal(
        registry: &mut PollRegistry,
        creator: address,
        title: String,
        description: String,
        options: vector<String>,
        reward_per_vote: u64,
        max_voters: u64,
        duration_secs: u64,
        reward_pool: u64,
        platform_fee: u64,
        coin_type_id: u8,
        fa_metadata_address: address,
    ) {
        let poll_id = registry.next_id;
        let num_options = vector::length(&options);
        let votes = vector::empty<u64>();

        // Initialize vote counts to 0
        let i = 0;
        while (i < num_options) {
            vector::push_back(&mut votes, 0);
            i = i + 1;
        };

        let poll = Poll {
            id: poll_id,
            creator,
            title,
            description,
            options,
            votes,
            voters: vector::empty(),
            reward_per_vote,
            reward_pool,
            max_voters,
            distribution_mode: DISTRIBUTION_UNSET,
            claimed: vector::empty(),
            rewards_distributed: false,
            end_time: timestamp::now_seconds() + duration_secs,
            status: STATUS_ACTIVE,
            coin_type_id,
            closed_at: 0,
            fa_metadata_address,
        };

        vector::push_back(&mut registry.polls, poll);
        registry.next_id = poll_id + 1;

        event::emit(PollCreated {
            poll_id,
            creator,
            title,
            reward_pool,
            max_voters,
            platform_fee,
            coin_type_id,
        });
    }

    /// Add MOVE funds to an existing poll (only creator can add funds)
    public entry fun fund_poll_with_move(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
        amount: u64,
    ) acquires PollRegistry, RewardVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);
        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.status == STATUS_ACTIVE, E_POLL_CLOSED);
        assert!(poll.coin_type_id == COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH);

        // Calculate and collect platform fee
        let platform_fee = (amount * registry.platform_fee_bps) / 10000;
        let net_amount = amount - platform_fee;

        // Transfer fee to treasury
        if (platform_fee > 0) {
            let fee_coins = coin::withdraw<AptosCoin>(account, platform_fee);
            coin::deposit(registry.platform_treasury, fee_coins);
            registry.total_fees_collected = registry.total_fees_collected + platform_fee;
        };

        // Transfer net amount to vault
        let vault = borrow_global_mut<RewardVault<AptosCoin>>(registry_addr);
        let payment = coin::withdraw<AptosCoin>(account, net_amount);
        coin::merge(&mut vault.coins, payment);

        poll.reward_pool = poll.reward_pool + net_amount;
    }

    /// Add FA funds to an existing poll (only creator can add funds)
    public entry fun fund_poll_with_fa(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
        amount: u64,
    ) acquires PollRegistry, GenericFAVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);
        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.status == STATUS_ACTIVE, E_POLL_CLOSED);
        assert!(poll.coin_type_id != COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH); // Must be FA type

        let fa_metadata_address = poll.fa_metadata_address;
        let fa_vault = borrow_global<GenericFAVault>(registry_addr);
        assert!(smart_table::contains(&fa_vault.stores, fa_metadata_address), E_FA_VAULT_NOT_INITIALIZED);

        // Calculate and collect platform fee
        let platform_fee = (amount * registry.platform_fee_bps) / 10000;
        let net_amount = amount - platform_fee;

        let metadata = object::address_to_object<Metadata>(fa_metadata_address);

        // Transfer fee to treasury
        if (platform_fee > 0) {
            let fee_fa = primary_fungible_store::withdraw(account, metadata, platform_fee);
            primary_fungible_store::deposit(registry.platform_treasury, fee_fa);
            registry.total_fees_collected = registry.total_fees_collected + platform_fee;
        };

        // Transfer net amount to FA vault
        let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
        let payment = primary_fungible_store::withdraw(account, metadata, net_amount);
        fungible_asset::deposit(*store, payment);

        poll.reward_pool = poll.reward_pool + net_amount;
    }

    /// Cast a vote on a poll
    public entry fun vote(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
        option_index: u64,
    ) acquires PollRegistry {
        let voter = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);

        // Check poll is active
        assert!(poll.status == STATUS_ACTIVE, E_POLL_CLOSED);
        assert!(timestamp::now_seconds() < poll.end_time, E_POLL_CLOSED);

        // Check valid option
        assert!(option_index < vector::length(&poll.options), E_INVALID_OPTION);

        // Check max voters limit (if set)
        let current_voters = vector::length(&poll.voters);
        if (poll.max_voters > 0) {
            assert!(current_voters < poll.max_voters, E_MAX_VOTERS_REACHED);
        };

        // For fixed reward mode, check if pool can cover this voter
        if (poll.reward_per_vote > 0 && poll.reward_pool > 0) {
            let required_for_next = poll.reward_per_vote;
            assert!(poll.reward_pool >= required_for_next * (current_voters + 1) ||
                    poll.reward_pool >= required_for_next, E_REWARD_POOL_EXHAUSTED);
        };

        // Check not already voted
        let i = 0;
        let len = vector::length(&poll.voters);
        while (i < len) {
            assert!(*vector::borrow(&poll.voters, i) != voter, E_ALREADY_VOTED);
            i = i + 1;
        };

        // Record vote
        let current_votes = vector::borrow_mut(&mut poll.votes, option_index);
        *current_votes = *current_votes + 1;
        vector::push_back(&mut poll.voters, voter);

        event::emit(VoteCast {
            poll_id,
            voter,
            option_index,
        });
    }

    /// Start claims on a poll and set distribution mode
    /// distribution_mode: 0 = Manual Pull (participants claim), 1 = Manual Push (creator distributes)
    /// Can only be called on ACTIVE polls
    /// Transitions: ACTIVE → CLAIMING_OR_DISTRIBUTION
    public entry fun start_claims(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
        distribution_mode: u8,
    ) acquires PollRegistry {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);
        assert!(distribution_mode <= 1, E_INVALID_DISTRIBUTION_MODE);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.status == STATUS_ACTIVE, E_POLL_CLOSED);

        // Set distribution mode
        poll.distribution_mode = distribution_mode;

        // Set status to CLAIMING_OR_DISTRIBUTION
        poll.status = STATUS_CLAIMING_OR_DISTRIBUTION;

        let total_voters = vector::length(&poll.voters);

        event::emit(PollClosed {
            poll_id,
            distribution_mode,
            total_voters,
        });
    }

    /// Close a poll (stop claims/distributions)
    /// Can only be called on CLAIMING_OR_DISTRIBUTION polls
    /// Transitions: CLAIMING_OR_DISTRIBUTION → CLOSED
    public entry fun close_poll(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.status == STATUS_CLAIMING_OR_DISTRIBUTION, E_POLL_NOT_CLAIMABLE);

        // Record closed timestamp for finalization grace period calculation
        poll.closed_at = timestamp::now_seconds();

        // Set status to CLOSED
        poll.status = STATUS_CLOSED;
    }

    /// Claim MOVE reward (for Manual Pull distribution mode)
    public entry fun claim_reward_move(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, RewardVault {
        let claimer = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.coin_type_id == COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH);

        // Must be in claiming status
        assert!(poll.status == STATUS_CLAIMING_OR_DISTRIBUTION, E_POLL_NOT_CLAIMABLE);
        assert!(poll.distribution_mode == DISTRIBUTION_MANUAL_PULL, E_INVALID_DISTRIBUTION_MODE);

        // Check claimer is a voter
        let is_voter = false;
        let i = 0;
        let len = vector::length(&poll.voters);
        while (i < len) {
            if (*vector::borrow(&poll.voters, i) == claimer) {
                is_voter = true;
                break
            };
            i = i + 1;
        };
        assert!(is_voter, E_NOT_VOTER);

        // Check not already claimed
        let j = 0;
        let claimed_len = vector::length(&poll.claimed);
        while (j < claimed_len) {
            assert!(*vector::borrow(&poll.claimed, j) != claimer, E_ALREADY_CLAIMED);
            j = j + 1;
        };

        // Calculate reward amount
        let voter_count = vector::length(&poll.voters);
        let reward_amount = if (voter_count > 0 && poll.reward_pool > 0) {
            if (poll.reward_per_vote > 0) {
                poll.reward_per_vote
            } else {
                poll.reward_pool / (voter_count as u64)
            }
        } else {
            0
        };

        assert!(reward_amount <= poll.reward_pool, E_INSUFFICIENT_FUNDS);

        if (reward_amount > 0) {
            let vault = borrow_global_mut<RewardVault<AptosCoin>>(registry_addr);
            let reward_coins = coin::extract(&mut vault.coins, reward_amount);
            coin::deposit(claimer, reward_coins);
            poll.reward_pool = poll.reward_pool - reward_amount;
        };

        vector::push_back(&mut poll.claimed, claimer);

        event::emit(RewardClaimed {
            poll_id,
            claimer,
            amount: reward_amount,
        });
    }

    /// Claim FA reward (for Manual Pull distribution mode) - works for PULSE, USDC, any FA
    public entry fun claim_reward_fa(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        let claimer = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.coin_type_id != COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH); // Must be FA type

        // Must be in claiming status
        assert!(poll.status == STATUS_CLAIMING_OR_DISTRIBUTION, E_POLL_NOT_CLAIMABLE);
        assert!(poll.distribution_mode == DISTRIBUTION_MANUAL_PULL, E_INVALID_DISTRIBUTION_MODE);

        // Check claimer is a voter
        let is_voter = false;
        let i = 0;
        let len = vector::length(&poll.voters);
        while (i < len) {
            if (*vector::borrow(&poll.voters, i) == claimer) {
                is_voter = true;
                break
            };
            i = i + 1;
        };
        assert!(is_voter, E_NOT_VOTER);

        // Check not already claimed
        let j = 0;
        let claimed_len = vector::length(&poll.claimed);
        while (j < claimed_len) {
            assert!(*vector::borrow(&poll.claimed, j) != claimer, E_ALREADY_CLAIMED);
            j = j + 1;
        };

        // Calculate reward amount
        let voter_count = vector::length(&poll.voters);
        let reward_amount = if (voter_count > 0 && poll.reward_pool > 0) {
            if (poll.reward_per_vote > 0) {
                poll.reward_per_vote
            } else {
                poll.reward_pool / (voter_count as u64)
            }
        } else {
            0
        };

        assert!(reward_amount <= poll.reward_pool, E_INSUFFICIENT_FUNDS);

        if (reward_amount > 0) {
            let fa_metadata_address = poll.fa_metadata_address;
            let fa_vault = borrow_global<GenericFAVault>(registry_addr);
            let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
            let vault_signer = object::generate_signer_for_extending(&fa_vault.extend_ref);
            let reward_fa = fungible_asset::withdraw(&vault_signer, *store, reward_amount);
            primary_fungible_store::deposit(claimer, reward_fa);
            poll.reward_pool = poll.reward_pool - reward_amount;
        };

        vector::push_back(&mut poll.claimed, claimer);

        event::emit(RewardClaimed {
            poll_id,
            claimer,
            amount: reward_amount,
        });
    }

    /// Distribute MOVE rewards to all voters (for Manual Push distribution mode)
    public entry fun distribute_rewards_move(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, RewardVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);

        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.coin_type_id == COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH);
        assert!(poll.status == STATUS_CLAIMING_OR_DISTRIBUTION, E_POLL_NOT_CLAIMABLE);
        assert!(poll.distribution_mode == DISTRIBUTION_MANUAL_PUSH, E_INVALID_DISTRIBUTION_MODE);
        assert!(!poll.rewards_distributed, E_REWARDS_ALREADY_DISTRIBUTED);

        let voter_count = vector::length(&poll.voters);
        let total_distributed = 0u64;

        if (voter_count > 0 && poll.reward_pool > 0) {
            let reward_per_voter = if (poll.reward_per_vote > 0) {
                poll.reward_per_vote
            } else {
                poll.reward_pool / (voter_count as u64)
            };

            let vault = borrow_global_mut<RewardVault<AptosCoin>>(registry_addr);

            let i = 0;
            while (i < voter_count) {
                let voter = *vector::borrow(&poll.voters, i);
                let actual_reward = if (reward_per_voter <= poll.reward_pool) {
                    reward_per_voter
                } else {
                    poll.reward_pool
                };

                if (actual_reward > 0 && actual_reward <= coin::value(&vault.coins)) {
                    let reward_coins = coin::extract(&mut vault.coins, actual_reward);
                    coin::deposit(voter, reward_coins);
                    poll.reward_pool = poll.reward_pool - actual_reward;
                    total_distributed = total_distributed + actual_reward;
                };

                i = i + 1;
            };
        };

        poll.rewards_distributed = true;

        event::emit(RewardsDistributed {
            poll_id,
            total_distributed,
            recipient_count: voter_count,
        });
    }

    /// Distribute FA rewards to all voters (for Manual Push distribution mode) - works for PULSE, USDC, any FA
    public entry fun distribute_rewards_fa(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);

        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.coin_type_id != COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH); // Must be FA type
        assert!(poll.status == STATUS_CLAIMING_OR_DISTRIBUTION, E_POLL_NOT_CLAIMABLE);
        assert!(poll.distribution_mode == DISTRIBUTION_MANUAL_PUSH, E_INVALID_DISTRIBUTION_MODE);
        assert!(!poll.rewards_distributed, E_REWARDS_ALREADY_DISTRIBUTED);

        let voter_count = vector::length(&poll.voters);
        let total_distributed = 0u64;

        if (voter_count > 0 && poll.reward_pool > 0) {
            let reward_per_voter = if (poll.reward_per_vote > 0) {
                poll.reward_per_vote
            } else {
                poll.reward_pool / (voter_count as u64)
            };

            let fa_metadata_address = poll.fa_metadata_address;
            let fa_vault = borrow_global<GenericFAVault>(registry_addr);
            let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
            let vault_signer = object::generate_signer_for_extending(&fa_vault.extend_ref);

            let i = 0;
            while (i < voter_count) {
                let voter = *vector::borrow(&poll.voters, i);
                let actual_reward = if (reward_per_voter <= poll.reward_pool) {
                    reward_per_voter
                } else {
                    poll.reward_pool
                };

                let vault_balance = fungible_asset::balance(*store);
                if (actual_reward > 0 && actual_reward <= vault_balance) {
                    let reward_fa = fungible_asset::withdraw(&vault_signer, *store, actual_reward);
                    primary_fungible_store::deposit(voter, reward_fa);
                    poll.reward_pool = poll.reward_pool - actual_reward;
                    total_distributed = total_distributed + actual_reward;
                };

                i = i + 1;
            };
        };

        poll.rewards_distributed = true;

        event::emit(RewardsDistributed {
            poll_id,
            total_distributed,
            recipient_count: voter_count,
        });
    }

    /// Withdraw excess MOVE funds from a poll (only creator, only in CLOSED status)
    public entry fun withdraw_remaining_move(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, RewardVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.coin_type_id == COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH);
        assert!(poll.status == STATUS_CLOSED, E_POLL_NOT_ENDED);

        let withdrawable = if (poll.distribution_mode == DISTRIBUTION_MANUAL_PULL && poll.reward_per_vote > 0) {
            let total_voters = vector::length(&poll.voters);
            let claimed_count = vector::length(&poll.claimed);
            let unclaimed_count = total_voters - claimed_count;
            let owed_to_unclaimed = (unclaimed_count as u64) * poll.reward_per_vote;
            if (poll.reward_pool > owed_to_unclaimed) {
                poll.reward_pool - owed_to_unclaimed
            } else {
                0
            }
        } else {
            poll.reward_pool
        };

        if (withdrawable > 0) {
            let vault = borrow_global_mut<RewardVault<AptosCoin>>(registry_addr);
            let coins = coin::extract(&mut vault.coins, withdrawable);
            coin::deposit(caller, coins);
            poll.reward_pool = poll.reward_pool - withdrawable;
        };
    }

    /// Withdraw excess FA funds from a poll (only creator, only in CLOSED status)
    public entry fun withdraw_remaining_fa(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.coin_type_id != COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH);
        assert!(poll.status == STATUS_CLOSED, E_POLL_NOT_ENDED);

        let withdrawable = if (poll.distribution_mode == DISTRIBUTION_MANUAL_PULL && poll.reward_per_vote > 0) {
            let total_voters = vector::length(&poll.voters);
            let claimed_count = vector::length(&poll.claimed);
            let unclaimed_count = total_voters - claimed_count;
            let owed_to_unclaimed = (unclaimed_count as u64) * poll.reward_per_vote;
            if (poll.reward_pool > owed_to_unclaimed) {
                poll.reward_pool - owed_to_unclaimed
            } else {
                0
            }
        } else {
            poll.reward_pool
        };

        if (withdrawable > 0) {
            let fa_metadata_address = poll.fa_metadata_address;
            let fa_vault = borrow_global<GenericFAVault>(registry_addr);
            let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
            let vault_signer = object::generate_signer_for_extending(&fa_vault.extend_ref);
            let fa = fungible_asset::withdraw(&vault_signer, *store, withdrawable);
            primary_fungible_store::deposit(caller, fa);
            poll.reward_pool = poll.reward_pool - withdrawable;
        };
    }

    /// Set platform fee (only admin)
    public entry fun set_platform_fee(
        account: &signer,
        registry_addr: address,
        fee_bps: u64,
    ) acquires PollRegistry {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(caller == registry.admin, E_NOT_ADMIN);
        assert!(fee_bps <= MAX_FEE_BPS, E_INVALID_FEE);

        let old_fee = registry.platform_fee_bps;
        registry.platform_fee_bps = fee_bps;

        event::emit(FeeUpdated {
            old_fee_bps: old_fee,
            new_fee_bps: fee_bps,
        });
    }

    /// Set treasury address (only admin)
    public entry fun set_treasury(
        account: &signer,
        registry_addr: address,
        treasury: address,
    ) acquires PollRegistry {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(caller == registry.admin, E_NOT_ADMIN);
        registry.platform_treasury = treasury;
    }

    /// Transfer admin role (only current admin)
    public entry fun transfer_admin(
        account: &signer,
        registry_addr: address,
        new_admin: address,
    ) acquires PollRegistry {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(caller == registry.admin, E_NOT_ADMIN);
        registry.admin = new_admin;
    }

    /// Set claim period (only admin)
    public entry fun set_claim_period(
        account: &signer,
        registry_addr: address,
        claim_period_secs: u64,
    ) acquires PollRegistry {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(caller == registry.admin, E_NOT_ADMIN);

        let old_period = registry.claim_period_secs;
        registry.claim_period_secs = claim_period_secs;

        event::emit(ClaimPeriodUpdated {
            old_period_secs: old_period,
            new_period_secs: claim_period_secs,
        });
    }

    /// Finalize a CLOSED poll with MOVE rewards
    public entry fun finalize_poll_move(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, RewardVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.coin_type_id == COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH);
        assert!(poll.status == STATUS_CLOSED, E_POLL_NOT_IN_CLAIMING);

        let current_time = timestamp::now_seconds();
        let finalize_deadline = poll.closed_at + registry.claim_period_secs;
        assert!(current_time >= finalize_deadline, E_CLAIM_PERIOD_NOT_ELAPSED);

        let unclaimed_amount = poll.reward_pool;
        let sent_to_treasury = false;

        if (unclaimed_amount > 0) {
            let vault = borrow_global_mut<RewardVault<AptosCoin>>(registry_addr);
            let coins = coin::extract(&mut vault.coins, unclaimed_amount);
            coin::deposit(registry.platform_treasury, coins);
            poll.reward_pool = 0;
            sent_to_treasury = true;
        };

        poll.status = STATUS_FINALIZED;

        event::emit(PollFinalized {
            poll_id,
            unclaimed_amount,
            sent_to_treasury,
        });
    }

    /// Finalize a CLOSED poll with FA rewards
    public entry fun finalize_poll_fa(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        let caller = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow_mut(&mut registry.polls, poll_id);
        assert!(poll.creator == caller, E_NOT_OWNER);
        assert!(poll.coin_type_id != COIN_TYPE_APTOS, E_COIN_TYPE_MISMATCH);
        assert!(poll.status == STATUS_CLOSED, E_POLL_NOT_IN_CLAIMING);

        let current_time = timestamp::now_seconds();
        let finalize_deadline = poll.closed_at + registry.claim_period_secs;
        assert!(current_time >= finalize_deadline, E_CLAIM_PERIOD_NOT_ELAPSED);

        let unclaimed_amount = poll.reward_pool;
        let sent_to_treasury = false;

        if (unclaimed_amount > 0) {
            let fa_metadata_address = poll.fa_metadata_address;
            let fa_vault = borrow_global<GenericFAVault>(registry_addr);
            let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
            let vault_signer = object::generate_signer_for_extending(&fa_vault.extend_ref);
            let fa = fungible_asset::withdraw(&vault_signer, *store, unclaimed_amount);
            primary_fungible_store::deposit(registry.platform_treasury, fa);
            poll.reward_pool = 0;
            sent_to_treasury = true;
        };

        poll.status = STATUS_FINALIZED;

        event::emit(PollFinalized {
            poll_id,
            unclaimed_amount,
            sent_to_treasury,
        });
    }

    // ============== Backward compatibility functions ==============
    // These call the generic FA functions for existing code that uses _pulse or _usdc suffixes

    /// Create a new poll with PULSE rewards (backward compatibility)
    public entry fun create_poll_with_pulse(
        account: &signer,
        registry_addr: address,
        title: String,
        description: String,
        options: vector<String>,
        reward_per_vote: u64,
        max_voters: u64,
        duration_secs: u64,
        fund_amount: u64,
    ) acquires PollRegistry, GenericFAVault {
        // Get PULSE metadata address from the pulse module
        let pulse_metadata = pulse::get_metadata();
        let pulse_metadata_address = object::object_address(&pulse_metadata);

        create_poll_with_fa(
            account,
            registry_addr,
            title,
            description,
            options,
            reward_per_vote,
            max_voters,
            duration_secs,
            fund_amount,
            pulse_metadata_address,
            COIN_TYPE_PULSE,
        );
    }

    /// Fund poll with PULSE (backward compatibility)
    public entry fun fund_poll_with_pulse(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
        amount: u64,
    ) acquires PollRegistry, GenericFAVault {
        fund_poll_with_fa(account, registry_addr, poll_id, amount);
    }

    /// Claim PULSE reward (backward compatibility)
    public entry fun claim_reward_pulse(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        claim_reward_fa(account, registry_addr, poll_id);
    }

    /// Distribute PULSE rewards (backward compatibility)
    public entry fun distribute_rewards_pulse(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        distribute_rewards_fa(account, registry_addr, poll_id);
    }

    /// Withdraw remaining PULSE (backward compatibility)
    public entry fun withdraw_remaining_pulse(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        withdraw_remaining_fa(account, registry_addr, poll_id);
    }

    /// Finalize poll with PULSE (backward compatibility)
    public entry fun finalize_poll_pulse(
        account: &signer,
        registry_addr: address,
        poll_id: u64,
    ) acquires PollRegistry, GenericFAVault {
        finalize_poll_fa(account, registry_addr, poll_id);
    }

    #[view]
    /// View function to get poll details
    public fun get_poll(registry_addr: address, poll_id: u64): Poll acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);
        *vector::borrow(&registry.polls, poll_id)
    }

    #[view]
    /// View function to get total number of polls
    public fun get_poll_count(registry_addr: address): u64 acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        vector::length(&registry.polls)
    }

    #[view]
    /// View function to check if address has voted
    public fun has_voted(registry_addr: address, poll_id: u64, voter: address): bool acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow(&registry.polls, poll_id);
        let i = 0;
        let len = vector::length(&poll.voters);
        while (i < len) {
            if (*vector::borrow(&poll.voters, i) == voter) {
                return true
            };
            i = i + 1;
        };
        false
    }

    #[view]
    /// View function to check if address has claimed reward
    public fun has_claimed(registry_addr: address, poll_id: u64, claimer: address): bool acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow(&registry.polls, poll_id);
        let i = 0;
        let len = vector::length(&poll.claimed);
        while (i < len) {
            if (*vector::borrow(&poll.claimed, i) == claimer) {
                return true
            };
            i = i + 1;
        };
        false
    }

    #[view]
    /// View function to get platform configuration
    public fun get_platform_config(registry_addr: address): (u64, address, u64, u64) acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        (registry.platform_fee_bps, registry.platform_treasury, registry.total_fees_collected, registry.claim_period_secs)
    }

    #[view]
    /// View function to get claim period in seconds
    public fun get_claim_period(registry_addr: address): u64 acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        registry.claim_period_secs
    }

    #[view]
    /// View function to check if poll can be finalized
    public fun can_finalize_poll(registry_addr: address, poll_id: u64): bool acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);

        let poll = vector::borrow(&registry.polls, poll_id);
        if (poll.status != STATUS_CLOSED) {
            return false
        };

        let current_time = timestamp::now_seconds();
        let finalize_deadline = poll.closed_at + registry.claim_period_secs;
        current_time >= finalize_deadline
    }

    #[view]
    /// View function to check if FA store is initialized for a metadata address
    public fun is_fa_store_initialized(registry_addr: address, fa_metadata_address: address): bool acquires GenericFAVault {
        let fa_vault = borrow_global<GenericFAVault>(registry_addr);
        smart_table::contains(&fa_vault.stores, fa_metadata_address)
    }
}
