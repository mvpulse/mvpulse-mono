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
    const E_QUESTIONNAIRE_NOT_FOUND: u64 = 24;
    const E_VOTES_OPTIONS_LENGTH_MISMATCH: u64 = 25;
    const E_QUESTIONNAIRE_INCOMPLETE: u64 = 26;
    const E_QUESTIONNAIRE_ALREADY_CLAIMED: u64 = 27;
    const E_QUESTIONNAIRE_NOT_CLAIMABLE: u64 = 28;
    const E_QUESTIONNAIRE_MAX_COMPLETERS_REACHED: u64 = 29;
    const E_BATCH_VECTOR_LENGTH_MISMATCH: u64 = 30;
    const E_BATCH_EMPTY: u64 = 31;

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

    /// Questionnaire reward pool for shared rewards (only complete voters get rewards)
    struct QuestionnaireRewardPool has store, drop, copy {
        id: u64,
        creator: address,
        poll_ids: vector<u64>,            // Poll IDs that must ALL be completed
        reward_pool: u64,                  // Shared reward pool amount
        reward_per_completion: u64,        // Fixed amount per completer (0 = equal split)
        max_completers: u64,               // Max users who can complete and claim (0 = unlimited)
        completers: vector<address>,       // Users who completed all polls
        claimed: vector<address>,          // Users who claimed their reward
        coin_type_id: u8,
        fa_metadata_address: address,
        status: u8,                        // 0=active, 1=closed, 2=claiming, 3=finalized
        end_time: u64,
        closed_at: u64,
    }

    /// Registry for questionnaire reward pools
    struct QuestionnaireRegistry has key {
        pools: vector<QuestionnaireRewardPool>,
        next_id: u64,
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

    #[event]
    struct BulkVoteCast has drop, store {
        voter: address,
        poll_ids: vector<u64>,
        option_indices: vector<u64>,
    }

    #[event]
    struct QuestionnairePoolCreated has drop, store {
        questionnaire_id: u64,
        creator: address,
        poll_ids: vector<u64>,
        reward_pool: u64,
        coin_type_id: u8,
    }

    #[event]
    struct QuestionnaireCompleted has drop, store {
        questionnaire_id: u64,
        completer: address,
        total_completers: u64,
    }

    #[event]
    struct QuestionnaireRewardClaimed has drop, store {
        questionnaire_id: u64,
        claimer: address,
        amount: u64,
    }

    #[event]
    /// Event emitted when multiple polls are created in a batch
    struct PollsBatchCreated has drop, store {
        poll_ids: vector<u64>,
        creator: address,
        poll_count: u64,
        total_reward_pool: u64,
        total_platform_fee: u64,
        coin_type_id: u8,
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

    /// Create multiple polls in a single atomic transaction with Fungible Asset rewards
    /// All polls are created or none (atomic). Useful for questionnaire creation.
    /// Parameters are parallel vectors where index i represents poll i's configuration.
    public entry fun create_polls_batch_with_fa(
        account: &signer,
        registry_addr: address,
        titles: vector<String>,
        descriptions: vector<String>,
        options_list: vector<vector<String>>,
        reward_per_votes: vector<u64>,
        max_voters_list: vector<u64>,
        duration_secs_list: vector<u64>,
        fund_amounts: vector<u64>,
        fa_metadata_address: address,
        coin_type_id: u8,
    ) acquires PollRegistry, GenericFAVault {
        let creator = signer::address_of(account);
        let poll_count = vector::length(&titles);

        // Validate batch is not empty and all vectors have same length
        assert!(poll_count > 0, E_BATCH_EMPTY);
        assert!(vector::length(&descriptions) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&options_list) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&reward_per_votes) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&max_voters_list) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&duration_secs_list) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&fund_amounts) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);

        let registry = borrow_global_mut<PollRegistry>(registry_addr);
        let fa_vault = borrow_global_mut<GenericFAVault>(registry_addr);

        // Ensure the FA store is initialized
        assert!(smart_table::contains(&fa_vault.stores, fa_metadata_address), E_FA_VAULT_NOT_INITIALIZED);

        // Calculate total fund amount and total fees
        let total_fund_amount = 0u64;
        let i = 0;
        while (i < poll_count) {
            total_fund_amount = total_fund_amount + *vector::borrow(&fund_amounts, i);
            i = i + 1;
        };

        // Calculate total fee and transfer once (more gas efficient)
        let total_platform_fee = (total_fund_amount * registry.platform_fee_bps) / 10000;
        let total_net_amount = total_fund_amount - total_platform_fee;

        if (total_fund_amount > 0) {
            let metadata = object::address_to_object<Metadata>(fa_metadata_address);

            // Transfer total fee to treasury (single transfer)
            if (total_platform_fee > 0) {
                let fee_fa = primary_fungible_store::withdraw(account, metadata, total_platform_fee);
                primary_fungible_store::deposit(registry.platform_treasury, fee_fa);
                registry.total_fees_collected = registry.total_fees_collected + total_platform_fee;
            };

            // Transfer total net amount to FA vault (single transfer)
            if (total_net_amount > 0) {
                let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
                let payment = primary_fungible_store::withdraw(account, metadata, total_net_amount);
                fungible_asset::deposit(*store, payment);
            };
        };

        // Track created poll IDs for the event
        let created_poll_ids = vector::empty<u64>();
        let total_reward_pool = 0u64;

        // Create each poll
        i = 0;
        while (i < poll_count) {
            let fund_amount = *vector::borrow(&fund_amounts, i);
            let reward_pool = if (fund_amount > 0) {
                let fee = (fund_amount * registry.platform_fee_bps) / 10000;
                fund_amount - fee
            } else {
                0
            };

            let poll_id = registry.next_id;
            vector::push_back(&mut created_poll_ids, poll_id);
            total_reward_pool = total_reward_pool + reward_pool;

            // Create poll using internal function (fee already collected above)
            create_poll_internal_no_event(
                registry,
                creator,
                *vector::borrow(&titles, i),
                *vector::borrow(&descriptions, i),
                *vector::borrow(&options_list, i),
                *vector::borrow(&reward_per_votes, i),
                *vector::borrow(&max_voters_list, i),
                *vector::borrow(&duration_secs_list, i),
                reward_pool,
                coin_type_id,
                fa_metadata_address,
            );

            i = i + 1;
        };

        // Emit single batch event
        event::emit(PollsBatchCreated {
            poll_ids: created_poll_ids,
            creator,
            poll_count,
            total_reward_pool,
            total_platform_fee,
            coin_type_id,
        });
    }

    /// Create multiple polls in a single atomic transaction with MOVE (AptosCoin) rewards
    public entry fun create_polls_batch_with_move(
        account: &signer,
        registry_addr: address,
        titles: vector<String>,
        descriptions: vector<String>,
        options_list: vector<vector<String>>,
        reward_per_votes: vector<u64>,
        max_voters_list: vector<u64>,
        duration_secs_list: vector<u64>,
        fund_amounts: vector<u64>,
    ) acquires PollRegistry, RewardVault {
        let creator = signer::address_of(account);
        let poll_count = vector::length(&titles);

        // Validate batch is not empty and all vectors have same length
        assert!(poll_count > 0, E_BATCH_EMPTY);
        assert!(vector::length(&descriptions) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&options_list) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&reward_per_votes) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&max_voters_list) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&duration_secs_list) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&fund_amounts) == poll_count, E_BATCH_VECTOR_LENGTH_MISMATCH);

        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        // Calculate total fund amount
        let total_fund_amount = 0u64;
        let i = 0;
        while (i < poll_count) {
            total_fund_amount = total_fund_amount + *vector::borrow(&fund_amounts, i);
            i = i + 1;
        };

        // Calculate total fee and transfer once
        let total_platform_fee = (total_fund_amount * registry.platform_fee_bps) / 10000;
        let total_net_amount = total_fund_amount - total_platform_fee;

        if (total_fund_amount > 0) {
            // Transfer total fee to treasury (single transfer)
            if (total_platform_fee > 0) {
                let fee_coins = coin::withdraw<AptosCoin>(account, total_platform_fee);
                coin::deposit(registry.platform_treasury, fee_coins);
                registry.total_fees_collected = registry.total_fees_collected + total_platform_fee;
            };

            // Transfer total net amount to vault (single transfer)
            if (total_net_amount > 0) {
                let vault = borrow_global_mut<RewardVault<AptosCoin>>(registry_addr);
                let payment = coin::withdraw<AptosCoin>(account, total_net_amount);
                coin::merge(&mut vault.coins, payment);
            };
        };

        // Track created poll IDs for the event
        let created_poll_ids = vector::empty<u64>();
        let total_reward_pool = 0u64;

        // Create each poll
        i = 0;
        while (i < poll_count) {
            let fund_amount = *vector::borrow(&fund_amounts, i);
            let reward_pool = if (fund_amount > 0) {
                let fee = (fund_amount * registry.platform_fee_bps) / 10000;
                fund_amount - fee
            } else {
                0
            };

            let poll_id = registry.next_id;
            vector::push_back(&mut created_poll_ids, poll_id);
            total_reward_pool = total_reward_pool + reward_pool;

            create_poll_internal_no_event(
                registry,
                creator,
                *vector::borrow(&titles, i),
                *vector::borrow(&descriptions, i),
                *vector::borrow(&options_list, i),
                *vector::borrow(&reward_per_votes, i),
                *vector::borrow(&max_voters_list, i),
                *vector::borrow(&duration_secs_list, i),
                reward_pool,
                COIN_TYPE_APTOS,
                @0x0,
            );

            i = i + 1;
        };

        // Emit single batch event
        event::emit(PollsBatchCreated {
            poll_ids: created_poll_ids,
            creator,
            poll_count,
            total_reward_pool,
            total_platform_fee,
            coin_type_id: COIN_TYPE_APTOS,
        });
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

    /// Internal function to create a poll without emitting individual event
    /// Used for batch creation where we emit a single batch event instead
    fun create_poll_internal_no_event(
        registry: &mut PollRegistry,
        creator: address,
        title: String,
        description: String,
        options: vector<String>,
        reward_per_vote: u64,
        max_voters: u64,
        duration_secs: u64,
        reward_pool: u64,
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
        // Note: No event emitted - caller should emit PollsBatchCreated instead
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

    // ============== Questionnaire Functions ==============

    /// Initialize the questionnaire registry (call once after poll registry init)
    public entry fun initialize_questionnaire_registry(account: &signer, registry_addr: address) acquires PollRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        assert!(signer::address_of(account) == registry.admin, E_NOT_ADMIN);

        let questionnaire_registry = QuestionnaireRegistry {
            pools: vector::empty(),
            next_id: 0,
        };
        move_to(account, questionnaire_registry);
    }

    /// Atomic bulk vote on multiple polls
    /// All votes succeed or all fail - atomic transaction
    /// poll_ids and option_indices must be same length
    public entry fun bulk_vote(
        account: &signer,
        registry_addr: address,
        poll_ids: vector<u64>,
        option_indices: vector<u64>,
    ) acquires PollRegistry {
        let voter = signer::address_of(account);
        let registry = borrow_global_mut<PollRegistry>(registry_addr);

        let len = vector::length(&poll_ids);
        assert!(len == vector::length(&option_indices), E_VOTES_OPTIONS_LENGTH_MISMATCH);
        assert!(len > 0, E_INVALID_OPTION);

        // Validate all polls first before making any changes
        let i = 0;
        while (i < len) {
            let poll_id = *vector::borrow(&poll_ids, i);
            let option_index = *vector::borrow(&option_indices, i);

            assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);
            let poll = vector::borrow(&registry.polls, poll_id);

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

            // Check not already voted
            let j = 0;
            let voters_len = vector::length(&poll.voters);
            while (j < voters_len) {
                assert!(*vector::borrow(&poll.voters, j) != voter, E_ALREADY_VOTED);
                j = j + 1;
            };

            i = i + 1;
        };

        // All validations passed, now record all votes
        i = 0;
        while (i < len) {
            let poll_id = *vector::borrow(&poll_ids, i);
            let option_index = *vector::borrow(&option_indices, i);

            let poll = vector::borrow_mut(&mut registry.polls, poll_id);

            // Record vote
            let current_votes = vector::borrow_mut(&mut poll.votes, option_index);
            *current_votes = *current_votes + 1;
            vector::push_back(&mut poll.voters, voter);

            i = i + 1;
        };

        event::emit(BulkVoteCast {
            voter,
            poll_ids,
            option_indices,
        });
    }

    /// Create a questionnaire-level shared reward pool
    /// poll_ids: The polls that must ALL be completed to qualify for rewards
    public entry fun create_questionnaire_pool_with_fa(
        account: &signer,
        registry_addr: address,
        poll_ids: vector<u64>,
        reward_per_completion: u64,    // 0 for equal split
        max_completers: u64,           // 0 for unlimited
        duration_secs: u64,
        fund_amount: u64,
        fa_metadata_address: address,
        coin_type_id: u8,
    ) acquires PollRegistry, QuestionnaireRegistry, GenericFAVault {
        let creator = signer::address_of(account);
        let registry = borrow_global<PollRegistry>(registry_addr);
        let questionnaire_registry = borrow_global_mut<QuestionnaireRegistry>(registry_addr);
        let fa_vault = borrow_global_mut<GenericFAVault>(registry_addr);

        // Ensure the FA store is initialized
        assert!(smart_table::contains(&fa_vault.stores, fa_metadata_address), E_FA_VAULT_NOT_INITIALIZED);

        // Validate all poll IDs exist
        let len = vector::length(&poll_ids);
        let i = 0;
        while (i < len) {
            let poll_id = *vector::borrow(&poll_ids, i);
            assert!(poll_id < vector::length(&registry.polls), E_POLL_NOT_FOUND);
            i = i + 1;
        };

        // Calculate and collect platform fee, transfer funds to vault
        let reward_pool = if (fund_amount > 0) {
            let platform_fee = (fund_amount * registry.platform_fee_bps) / 10000;
            let net_amount = fund_amount - platform_fee;

            let metadata = object::address_to_object<Metadata>(fa_metadata_address);

            // Transfer fee to treasury
            if (platform_fee > 0) {
                let fee_fa = primary_fungible_store::withdraw(account, metadata, platform_fee);
                primary_fungible_store::deposit(registry.platform_treasury, fee_fa);
            };

            // Transfer net amount to FA vault
            let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
            let payment = primary_fungible_store::withdraw(account, metadata, net_amount);
            fungible_asset::deposit(*store, payment);
            net_amount
        } else {
            0
        };

        let questionnaire_id = questionnaire_registry.next_id;
        let pool = QuestionnaireRewardPool {
            id: questionnaire_id,
            creator,
            poll_ids,
            reward_pool,
            reward_per_completion,
            max_completers,
            completers: vector::empty(),
            claimed: vector::empty(),
            coin_type_id,
            fa_metadata_address,
            status: STATUS_ACTIVE,
            end_time: timestamp::now_seconds() + duration_secs,
            closed_at: 0,
        };

        vector::push_back(&mut questionnaire_registry.pools, pool);
        questionnaire_registry.next_id = questionnaire_id + 1;

        event::emit(QuestionnairePoolCreated {
            questionnaire_id,
            creator,
            poll_ids,
            reward_pool,
            coin_type_id,
        });
    }

    /// Mark a user as having completed a questionnaire (for shared pool rewards)
    /// Called after bulk_vote to register completion
    public entry fun mark_questionnaire_completed(
        account: &signer,
        registry_addr: address,
        questionnaire_id: u64,
    ) acquires PollRegistry, QuestionnaireRegistry {
        let completer = signer::address_of(account);
        let registry = borrow_global<PollRegistry>(registry_addr);
        let questionnaire_registry = borrow_global_mut<QuestionnaireRegistry>(registry_addr);

        assert!(questionnaire_id < vector::length(&questionnaire_registry.pools), E_QUESTIONNAIRE_NOT_FOUND);
        let pool = vector::borrow_mut(&mut questionnaire_registry.pools, questionnaire_id);

        // Check questionnaire is active
        assert!(pool.status == STATUS_ACTIVE, E_QUESTIONNAIRE_NOT_CLAIMABLE);

        // Check max completers limit
        if (pool.max_completers > 0) {
            assert!(vector::length(&pool.completers) < pool.max_completers, E_QUESTIONNAIRE_MAX_COMPLETERS_REACHED);
        };

        // Check user hasn't already completed
        let i = 0;
        let len = vector::length(&pool.completers);
        while (i < len) {
            assert!(*vector::borrow(&pool.completers, i) != completer, E_QUESTIONNAIRE_ALREADY_CLAIMED);
            i = i + 1;
        };

        // Check user has voted on all polls in the questionnaire
        let poll_count = vector::length(&pool.poll_ids);
        let j = 0;
        while (j < poll_count) {
            let poll_id = *vector::borrow(&pool.poll_ids, j);
            let poll = vector::borrow(&registry.polls, poll_id);

            // Check if user is in voters list
            let is_voter = false;
            let k = 0;
            let voters_len = vector::length(&poll.voters);
            while (k < voters_len) {
                if (*vector::borrow(&poll.voters, k) == completer) {
                    is_voter = true;
                    break
                };
                k = k + 1;
            };
            assert!(is_voter, E_QUESTIONNAIRE_INCOMPLETE);
            j = j + 1;
        };

        // Add to completers list
        vector::push_back(&mut pool.completers, completer);

        event::emit(QuestionnaireCompleted {
            questionnaire_id,
            completer,
            total_completers: vector::length(&pool.completers),
        });
    }

    /// Start questionnaire claiming period (only creator)
    public entry fun start_questionnaire_claims(
        account: &signer,
        registry_addr: address,
        questionnaire_id: u64,
    ) acquires QuestionnaireRegistry {
        let caller = signer::address_of(account);
        let questionnaire_registry = borrow_global_mut<QuestionnaireRegistry>(registry_addr);

        assert!(questionnaire_id < vector::length(&questionnaire_registry.pools), E_QUESTIONNAIRE_NOT_FOUND);
        let pool = vector::borrow_mut(&mut questionnaire_registry.pools, questionnaire_id);

        assert!(pool.creator == caller, E_NOT_OWNER);
        assert!(pool.status == STATUS_ACTIVE, E_QUESTIONNAIRE_NOT_CLAIMABLE);

        pool.status = STATUS_CLAIMING_OR_DISTRIBUTION;
        pool.closed_at = timestamp::now_seconds();
    }

    /// Claim questionnaire-level reward (for shared pool)
    public entry fun claim_questionnaire_reward_fa(
        account: &signer,
        registry_addr: address,
        questionnaire_id: u64,
    ) acquires QuestionnaireRegistry, GenericFAVault {
        let claimer = signer::address_of(account);
        let questionnaire_registry = borrow_global_mut<QuestionnaireRegistry>(registry_addr);

        assert!(questionnaire_id < vector::length(&questionnaire_registry.pools), E_QUESTIONNAIRE_NOT_FOUND);
        let pool = vector::borrow_mut(&mut questionnaire_registry.pools, questionnaire_id);

        // Must be in claiming status
        assert!(pool.status == STATUS_CLAIMING_OR_DISTRIBUTION, E_QUESTIONNAIRE_NOT_CLAIMABLE);

        // Check claimer is a completer
        let is_completer = false;
        let i = 0;
        let len = vector::length(&pool.completers);
        while (i < len) {
            if (*vector::borrow(&pool.completers, i) == claimer) {
                is_completer = true;
                break
            };
            i = i + 1;
        };
        assert!(is_completer, E_QUESTIONNAIRE_INCOMPLETE);

        // Check not already claimed
        let j = 0;
        let claimed_len = vector::length(&pool.claimed);
        while (j < claimed_len) {
            assert!(*vector::borrow(&pool.claimed, j) != claimer, E_QUESTIONNAIRE_ALREADY_CLAIMED);
            j = j + 1;
        };

        // Calculate reward amount
        let completer_count = vector::length(&pool.completers);
        let reward_amount = if (completer_count > 0 && pool.reward_pool > 0) {
            if (pool.reward_per_completion > 0) {
                pool.reward_per_completion
            } else {
                pool.reward_pool / (completer_count as u64)
            }
        } else {
            0
        };

        assert!(reward_amount <= pool.reward_pool, E_INSUFFICIENT_FUNDS);

        if (reward_amount > 0) {
            let fa_metadata_address = pool.fa_metadata_address;
            let fa_vault = borrow_global<GenericFAVault>(registry_addr);
            let store = smart_table::borrow(&fa_vault.stores, fa_metadata_address);
            let vault_signer = object::generate_signer_for_extending(&fa_vault.extend_ref);
            let reward_fa = fungible_asset::withdraw(&vault_signer, *store, reward_amount);
            primary_fungible_store::deposit(claimer, reward_fa);
            pool.reward_pool = pool.reward_pool - reward_amount;
        };

        vector::push_back(&mut pool.claimed, claimer);

        event::emit(QuestionnaireRewardClaimed {
            questionnaire_id,
            claimer,
            amount: reward_amount,
        });
    }

    #[view]
    /// Check if user has completed all polls in a questionnaire
    public fun has_completed_questionnaire(
        registry_addr: address,
        questionnaire_id: u64,
        user: address,
    ): bool acquires PollRegistry, QuestionnaireRegistry {
        let registry = borrow_global<PollRegistry>(registry_addr);
        let questionnaire_registry = borrow_global<QuestionnaireRegistry>(registry_addr);

        if (questionnaire_id >= vector::length(&questionnaire_registry.pools)) {
            return false
        };

        let pool = vector::borrow(&questionnaire_registry.pools, questionnaire_id);
        let poll_count = vector::length(&pool.poll_ids);
        let i = 0;

        while (i < poll_count) {
            let poll_id = *vector::borrow(&pool.poll_ids, i);
            if (poll_id >= vector::length(&registry.polls)) {
                return false
            };

            let poll = vector::borrow(&registry.polls, poll_id);

            // Check if user is in voters list
            let is_voter = false;
            let j = 0;
            let voters_len = vector::length(&poll.voters);
            while (j < voters_len) {
                if (*vector::borrow(&poll.voters, j) == user) {
                    is_voter = true;
                    break
                };
                j = j + 1;
            };

            if (!is_voter) {
                return false
            };

            i = i + 1;
        };

        true
    }

    #[view]
    /// Get questionnaire pool details
    public fun get_questionnaire_pool(
        registry_addr: address,
        questionnaire_id: u64,
    ): QuestionnaireRewardPool acquires QuestionnaireRegistry {
        let questionnaire_registry = borrow_global<QuestionnaireRegistry>(registry_addr);
        assert!(questionnaire_id < vector::length(&questionnaire_registry.pools), E_QUESTIONNAIRE_NOT_FOUND);
        *vector::borrow(&questionnaire_registry.pools, questionnaire_id)
    }

    #[view]
    /// Get total number of questionnaire pools
    public fun get_questionnaire_pool_count(registry_addr: address): u64 acquires QuestionnaireRegistry {
        let questionnaire_registry = borrow_global<QuestionnaireRegistry>(registry_addr);
        vector::length(&questionnaire_registry.pools)
    }

    #[view]
    /// Check if user has claimed questionnaire reward
    public fun has_claimed_questionnaire(
        registry_addr: address,
        questionnaire_id: u64,
        user: address,
    ): bool acquires QuestionnaireRegistry {
        let questionnaire_registry = borrow_global<QuestionnaireRegistry>(registry_addr);

        if (questionnaire_id >= vector::length(&questionnaire_registry.pools)) {
            return false
        };

        let pool = vector::borrow(&questionnaire_registry.pools, questionnaire_id);
        let i = 0;
        let len = vector::length(&pool.claimed);
        while (i < len) {
            if (*vector::borrow(&pool.claimed, i) == user) {
                return true
            };
            i = i + 1;
        };
        false
    }
}
