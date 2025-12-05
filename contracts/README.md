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
└── swap/          # PULSE/USDC AMM swap
    ├── Move.toml
    └── sources/
        └── swap.move
```

## Deployed Contracts (Testnet)

| Package | Address | Module |
|---------|---------|--------|
| **pulse** | `0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737` | `pulse::pulse` |
| **poll** | `0x306980d338caa4537e109afdc15f7f749b5948c9e69ec0178a7527363cdca70e` | `poll::poll` |
| **swap** | `0x55872704413ffc43bb832df7eb14c0665c9ae401897077a262d56e2de37d2b7e` | `swap::swap` |

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

### Entry Functions

| Function | Description |
|----------|-------------|
| `initialize()` | Initialize poll registry (admin only, one-time) |
| `create_poll_with_move(...)` | Create a poll with MOVE rewards |
| `create_poll_with_pulse(...)` | Create a poll with PULSE rewards |
| `vote(registry, poll_id, option)` | Cast a vote on a poll |
| `close_poll(registry, poll_id, mode)` | Close poll and set distribution mode |
| `claim_reward_move(registry, poll_id)` | Claim MOVE reward (manual pull mode) |
| `claim_reward_pulse(registry, poll_id)` | Claim PULSE reward (manual pull mode) |
| `distribute_rewards_move(...)` | Push MOVE rewards to all voters |
| `distribute_rewards_pulse(...)` | Push PULSE rewards to all voters |
| `fund_poll_with_move(...)` | Add MOVE funds to an existing poll |
| `fund_poll_with_pulse(...)` | Add PULSE funds to an existing poll |
| `withdraw_remaining_move(...)` | Withdraw unclaimed MOVE from closed poll |
| `withdraw_remaining_pulse(...)` | Withdraw unclaimed PULSE from closed poll |
| `set_platform_fee(registry, fee_bps)` | Update platform fee (admin only) |
| `set_treasury(registry, treasury)` | Update treasury address (admin only) |
| `transfer_admin(registry, new_admin)` | Transfer admin role |

### View Functions

| Function | Returns |
|----------|---------|
| `get_poll(registry, poll_id)` | Poll details |
| `get_poll_count(registry)` | Total number of polls |
| `has_voted(registry, poll_id, voter)` | Check if address has voted |
| `has_claimed(registry, poll_id, claimer)` | Check if address has claimed |
| `get_platform_config(registry)` | Fee, treasury, total fees collected |

### Poll Parameters

- **reward_per_vote**: Fixed amount per voter (0 = equal split mode)
- **max_voters**: Maximum voters allowed (0 = unlimited in fixed mode)
- **distribution_mode**: 0 = Manual Pull, 1 = Manual Push
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
