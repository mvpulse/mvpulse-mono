# Poll Contract Deployment Guide

This guide documents the steps required to deploy the MVPulse Poll contract to Movement Network.

## Prerequisites

1. Movement CLI installed
2. A Movement account with sufficient MOVE tokens for gas
3. The contract code compiled and ready

## Deployment Steps

### Step 1: Create a New Profile (if needed)

```bash
cd /Users/east/workspace/move/mvpulse/contracts/poll

# Create a new account for deployment
movement init --profile <profile-name> --network testnet
# Or for mainnet:
# movement init --profile <profile-name> --network mainnet
```

### Step 2: Fund the Account

```bash
# For testnet only - use faucet
movement account fund-with-faucet --profile <profile-name>

# For mainnet - transfer MOVE tokens to the account address shown in init
```

### Step 3: Update Move.toml

Update the `poll` address in `Move.toml` to match your deployment account:

```toml
[addresses]
poll = "<your-account-address>"
pulse = "<pulse-contract-address>"
```

### Step 4: Compile the Contract

```bash
movement move compile --profile <profile-name>
```

### Step 5: Publish the Contract

```bash
movement move publish --profile <profile-name> --assume-yes
```

### Step 6: Initialize the Poll Registry

```bash
movement move run \
  --function-id "<contract-address>::poll::initialize" \
  --profile <profile-name> \
  --assume-yes
```

### Step 7: Initialize FA Stores for Supported Tokens

#### Initialize PULSE FA Store

```bash
movement move run \
  --function-id "<contract-address>::poll::initialize_fa_store" \
  --args address:<contract-address> address:<pulse-metadata-address> \
  --profile <profile-name> \
  --assume-yes
```

#### Initialize USDC FA Store (optional)

```bash
movement move run \
  --function-id "<contract-address>::poll::initialize_fa_store" \
  --args address:<contract-address> address:<usdc-contract-address> \
  --profile <profile-name> \
  --assume-yes
```

### Step 8: Initialize Questionnaire Registry

```bash
movement move run \
  --function-id "<contract-address>::poll::initialize_questionnaire_registry" \
  --args address:<contract-address> \
  --profile <profile-name> \
  --assume-yes
```

### Step 9: Update Frontend Configuration

Update the `.env` file with the new contract address:

```env
# For testnet
VITE_TESTNET_CONTRACT_ADDRESS=<contract-address>

# For mainnet
VITE_MAINNET_CONTRACT_ADDRESS=<contract-address>
```

---

## Quick Reference: Testnet Addresses

| Resource | Address |
|----------|---------|
| Poll Contract | `0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde` |
| PULSE Contract | `0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737` |
| PULSE Metadata | `0x4c7028f47b62b952c11bbeb0ba209523b0e3d54205c085752905bcccd35f2f03` |
| USDC Contract | `0xb89077cfd2a82a0c1450534d49cfd5f2707643155273069bc23a912bcfefdee7` |

## Quick Reference: Mainnet Addresses

| Resource | Address |
|----------|---------|
| Poll Contract | _TBD_ |
| PULSE Contract | _TBD_ |
| PULSE Metadata | _TBD_ |
| USDC Contract | _TBD_ |

---

## Complete Testnet Deployment Commands

For reference, here are the exact commands used for the testnet deployment:

```bash
cd /Users/east/workspace/move/mvpulse/contracts/poll

# 1. Publish contract (already done during development)
movement move publish --profile poll-batch --assume-yes

# 2. Initialize poll registry
movement move run \
  --function-id "0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde::poll::initialize" \
  --profile poll-batch \
  --assume-yes

# 3. Initialize PULSE FA store
movement move run \
  --function-id "0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde::poll::initialize_fa_store" \
  --args address:0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde address:0x4c7028f47b62b952c11bbeb0ba209523b0e3d54205c085752905bcccd35f2f03 \
  --profile poll-batch \
  --assume-yes

# 4. Initialize USDC FA store
movement move run \
  --function-id "0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde::poll::initialize_fa_store" \
  --args address:0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde address:0xb89077cfd2a82a0c1450534d49cfd5f2707643155273069bc23a912bcfefdee7 \
  --profile poll-batch \
  --assume-yes

# 5. Initialize questionnaire registry
movement move run \
  --function-id "0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde::poll::initialize_questionnaire_registry" \
  --args address:0x4a3593c9631d8686a00b72eaf4da8341947386c6ced38513fb5a88a63aa10cde \
  --profile poll-batch \
  --assume-yes
```

---

## Verification

After deployment, verify the contract is working:

```bash
# Check poll count
movement move view \
  --function-id "<contract-address>::poll::get_poll_count" \
  --args address:<contract-address> \
  --profile <profile-name>

# Check questionnaire pool count
movement move view \
  --function-id "<contract-address>::poll::get_questionnaire_pool_count" \
  --args address:<contract-address> \
  --profile <profile-name>
```

---

## Troubleshooting

### Error: "Failed to borrow global resource"
The contract hasn't been initialized. Run the `initialize` function first.

### Error: "E_FA_VAULT_NOT_INITIALIZED"
The FA store for the token hasn't been initialized. Run `initialize_fa_store` for the specific token.

### Error: "Execution failed in poll::claim_reward_fa"
The questionnaire registry hasn't been initialized. Run `initialize_questionnaire_registry`.

### Error: "MODULE_ADDRESS_DOES_NOT_MATCH_SENDER"
The address in `Move.toml` doesn't match the deploying account. Update `Move.toml` with the correct address.

### Error: "BACKWARD_INCOMPATIBLE_MODULE_UPDATE"
The contract already exists at this address and can't be upgraded with breaking changes. Deploy to a new account instead.
