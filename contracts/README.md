# MVPulse Smart Contracts

Move smart contracts for the MVPulse dApp on Movement Network.

## Package Structure

The contracts are split into three independent packages for modularity:

```
contracts/
├── pulse/         # PULSE token (Fungible Asset)
│   ├── Move.toml
│   └── sources/
│       └── pulse.move
├── poll/          # Polling system with rewards
│   ├── Move.toml
│   └── sources/
│       └── poll.move
├── swap/          # PULSE/USDC AMM swap
│   ├── Move.toml
│   └── sources/
│       └── swap.move
└── staking/       # PULSE staking for tier qualification
    ├── Move.toml
    └── sources/
        └── staking.move
```

## Deployed Contracts (Testnet)

| Package | Address | Module |
|---------|---------|--------|
| **pulse** | `0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737` | `pulse::pulse` |
| **poll** | `0x7da34dec279b1e7247a612d017a4b931977ce3bdcdffca54da28c508388c60de` | `poll::poll` |
| **swap** | `0x55872704413ffc43bb832df7eb14c0665c9ae401897077a262d56e2de37d2b7e` | `swap::swap` |
| **staking** | `0xa317fa282be3423cd8378b818f04ba9492981d955206ed2a46eff281be8aa55f` | `staking::staking` |

## Prerequisites

### Install Movement CLI

```bash
# Option 1: Install script
curl -fsSL https://raw.githubusercontent.com/movementlabsxyz/aptos-core/main/scripts/install_cli.sh | bash

# Option 2: Homebrew (macOS)
brew install movementlabsxyz/tap/movement

# Verify installation
movement --version
```

## Setup

### 1. Initialize Account (First Time Only)

Each package directory needs its own `.movement` config:

```bash
# For Testnet
cd contracts/pulse
movement init --network testnet

# Repeat for poll and swap packages
cd ../poll && movement init --network testnet
cd ../swap && movement init --network testnet
```

### 2. Fund Your Account (Testnet)

```bash
movement account fund-with-faucet --amount 100000000
```

## Compilation

Compile each package separately:

```bash
# Compile pulse
cd contracts/pulse
movement move compile

# Compile poll (depends on pulse)
cd ../poll
movement move compile

# Compile swap (depends on pulse)
cd ../swap
movement move compile
```

## Deployment

Deploy packages in order (pulse first, then poll and swap):

```bash
# 1. Deploy pulse package
cd contracts/pulse
movement move publish --assume-yes

# 2. Initialize pulse token
movement move run --function-id 'default::pulse::initialize'

# 3. Deploy poll package
cd ../poll
movement move publish --assume-yes

# 4. Initialize poll registry
movement move run --function-id 'default::poll::initialize'

# 5. Deploy swap package
cd ../swap
movement move publish --assume-yes

# 6. Initialize swap pool (USDC address required)
movement move run --function-id 'default::swap::initialize' \
  --args address:0xb89077cfd2a82a0c1450534d49cfd5f2707643155273069bc23a912bcfefdee7 \
  --args u64:30
```

---

## Module: pulse::pulse

PULSE token - A Fungible Asset with fixed supply of 1 billion tokens.

### Entry Functions

| Function | Description |
|----------|-------------|
| `initialize()` | Initialize PULSE token metadata (admin only, one-time) |
| `mint_all_to_treasury(treasury)` | Mint entire supply to treasury, permanently disable minting |
| `faucet()` | Get 1000 PULSE for testing (testnet only) |
| `burn(amount)` | Burn your own PULSE tokens |
| `transfer(to, amount)` | Transfer PULSE to another address |

### View Functions

| Function | Returns |
|----------|---------|
| `total_minted()` | Total PULSE minted |
| `max_supply()` | Maximum supply (1 billion) |
| `remaining_supply()` | Remaining mintable supply |
| `balance(account)` | PULSE balance for an address |
| `is_initialized()` | Check if PULSE is initialized |
| `is_minting_enabled()` | Check if minting is still enabled |

---

## Module: poll::poll

Polling system with MOVE and PULSE reward support.

> **Note:** For detailed poll lifecycle documentation, see [poll/POLL_STATUS_WORKFLOW.md](poll/POLL_STATUS_WORKFLOW.md)

### Poll Status Workflow

```
ACTIVE (0) → CLAIMING_OR_DISTRIBUTION (2) → CLOSED (1) → FINALIZED (3)
```

| Status | Value | Description |
|--------|-------|-------------|
| `ACTIVE` | 0 | Poll is accepting votes |
| `CLOSED` | 1 | Claims/distributions stopped, grace period active |
| `CLAIMING_OR_DISTRIBUTION` | 2 | Participants can claim or creator distributes rewards |
| `FINALIZED` | 3 | Poll complete, unclaimed rewards sent to treasury |

### Entry Functions

| Function | Description |
|----------|-------------|
| `initialize()` | Initialize poll registry (admin only, one-time) |
| `create_poll_with_move(...)` | Create a poll with MOVE rewards |
| `create_poll_with_pulse(...)` | Create a poll with PULSE rewards |
| `vote(registry, poll_id, option)` | Cast a vote on a poll |
| `start_claims(registry, poll_id, distribution_mode)` | Start claiming phase (ACTIVE → CLAIMING_OR_DISTRIBUTION) |
| `close_poll(registry, poll_id)` | Close poll and start grace period (CLAIMING_OR_DISTRIBUTION → CLOSED) |
| `claim_reward_move(registry, poll_id)` | Claim MOVE reward (MANUAL_PULL mode) |
| `claim_reward_pulse(registry, poll_id)` | Claim PULSE reward (MANUAL_PULL mode) |
| `distribute_rewards_move(...)` | Push MOVE rewards to all voters (MANUAL_PUSH mode) |
| `distribute_rewards_pulse(...)` | Push PULSE rewards to all voters (MANUAL_PUSH mode) |
| `fund_poll_with_move(...)` | Add MOVE funds to an existing poll |
| `fund_poll_with_pulse(...)` | Add PULSE funds to an existing poll |
| `withdraw_remaining_move(...)` | Withdraw excess MOVE from closed poll (minus pending claims) |
| `withdraw_remaining_pulse(...)` | Withdraw excess PULSE from closed poll (minus pending claims) |
| `finalize_poll_move(registry, poll_id)` | Finalize poll, send unclaimed to treasury (CLOSED → FINALIZED) |
| `finalize_poll_pulse(registry, poll_id)` | Finalize poll, send unclaimed to treasury (CLOSED → FINALIZED) |
| `set_platform_fee(registry, fee_bps)` | Update platform fee (admin only) |
| `set_treasury(registry, treasury)` | Update treasury address (admin only) |
| `set_claim_period(registry, seconds)` | Update grace period duration (admin only) |
| `transfer_admin(registry, new_admin)` | Transfer admin role |

### View Functions

| Function | Returns |
|----------|---------|
| `get_poll(registry, poll_id)` | Poll details |
| `get_poll_count(registry)` | Total number of polls |
| `has_voted(registry, poll_id, voter)` | Check if address has voted |
| `has_claimed(registry, poll_id, claimer)` | Check if address has claimed |
| `can_finalize_poll(registry, poll_id)` | Check if grace period has elapsed |
| `get_claim_period(registry)` | Get grace period duration in seconds |
| `get_platform_config(registry)` | Fee, treasury, total fees collected |

### Poll Parameters

- **reward_per_vote**: Fixed amount per voter (0 = equal split mode)
- **max_voters**: Maximum voters allowed (0 = unlimited in fixed mode)
- **distribution_mode**: 0 = MANUAL_PULL (voters claim), 1 = MANUAL_PUSH (creator distributes)
- **coin_type_id**: 0 = MOVE, 1 = PULSE

---

## Module: swap::swap

AMM swap for PULSE/USDC trading using constant product (x*y=k).

### Entry Functions

| Function | Description |
|----------|-------------|
| `initialize(stable_metadata, fee_bps)` | Initialize pool (admin only) |
| `add_liquidity(pulse, stable, min_lp)` | Add liquidity to the pool |
| `remove_liquidity(lp_shares, min_pulse, min_stable)` | Remove liquidity |
| `swap_pulse_to_stable(pulse_in, min_out)` | Sell PULSE for USDC |
| `swap_stable_to_pulse(stable_in, min_out)` | Buy PULSE with USDC |
| `set_fee(new_fee_bps)` | Update swap fee (admin only) |
| `transfer_admin(new_admin)` | Transfer admin role |

### View Functions

| Function | Returns |
|----------|---------|
| `get_reserves()` | (pulse_reserve, stable_reserve) |
| `get_pool_info()` | (pulse, stable, total_lp, fee_bps) |
| `get_lp_position(provider)` | LP shares for an address |
| `get_amount_out(amount, is_pulse_to_stable)` | Quote swap output |
| `get_price_impact(amount, is_pulse_to_stable)` | Price impact in bps |
| `get_spot_price()` | Current PULSE/USDC price |
| `is_initialized()` | Check if pool is initialized |

---

## Network Information

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Testnet | 250 | https://testnet.movementnetwork.xyz/v1 |
| Mainnet | 126 | https://full.mainnet.movementinfra.xyz/v1 |

## External Dependencies

- **USDC (Testnet)**: `0xb89077cfd2a82a0c1450534d49cfd5f2707643155273069bc23a912bcfefdee7`

## Resources

- [Movement Docs](https://docs.movementnetwork.xyz)
- [Move Language Book](https://move-language.github.io/move/)
- [Aptos Move Examples](https://github.com/aptos-labs/aptos-core/tree/main/aptos-move/move-examples)
