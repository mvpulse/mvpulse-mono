# MVPulse

A decentralized polling and rewards platform built on Movement Network. Create polls, vote, and earn rewards in MOVE or PULSE tokens.

## Project Structure

```
mvpulse/
├── frontend/          # React + Vite dApp with wallet connection
└── contracts/         # Move smart contracts
    ├── pulse/         # PULSE token (Fungible Asset)
    ├── poll/          # Polling system with rewards
    └── swap/          # PULSE/USDC AMM swap
```

## Deployed Contracts (Testnet)

| Package | Address | Module |
|---------|---------|--------|
| **pulse** | `0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737` | `pulse::pulse` |
| **poll** | `0x306980d338caa4537e109afdc15f7f749b5948c9e69ec0178a7527363cdca70e` | `poll::poll` |
| **swap** | `0x55872704413ffc43bb832df7eb14c0665c9ae401897077a262d56e2de37d2b7e` | `swap::swap` |

## Features

### Polling System
- Create polls with MOVE or PULSE rewards
- Multiple reward distribution modes (Fixed per vote, Equal split)
- Platform fee (2%) for sustainability
- Manual claim or automatic distribution

### PULSE Token
- Fixed supply Fungible Asset (FA) token
- 1 billion max supply
- Testnet faucet for development

### Token Swap
- AMM-based PULSE/USDC swap
- Constant product (x*y=k) market maker
- Liquidity provision with LP shares

## Frontend

The frontend is a React + Vite application with wallet connection support.

### Setup

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Features

- Multi-wallet support (Petra, Nightly, Martian, Pontem, Privy)
- Movement Network testnet and mainnet support
- PULSE faucet for testnet
- Poll creation and voting
- Token swap interface

### Environment Variables

Create a `.env` file in the `frontend/` directory:

```env
# Testnet
VITE_TESTNET_CONTRACT_ADDRESS=0x306980d338caa4537e109afdc15f7f749b5948c9e69ec0178a7527363cdca70e
VITE_TESTNET_PULSE_CONTRACT_ADDRESS=0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737
VITE_TESTNET_SWAP_CONTRACT_ADDRESS=0x55872704413ffc43bb832df7eb14c0665c9ae401897077a262d56e2de37d2b7e
VITE_TESTNET_USDC_CONTRACT_ADDRESS=0xb89077cfd2a82a0c1450534d49cfd5f2707643155273069bc23a912bcfefdee7

# Privy (optional)
VITE_PRIVY_APP_ID=your_privy_app_id
```

## Contracts

See [contracts/README.md](contracts/README.md) for detailed contract documentation.

### Quick Start

```bash
# Compile all packages
cd contracts/pulse && movement move compile
cd contracts/poll && movement move compile
cd contracts/swap && movement move compile

# Deploy (requires funded account)
cd contracts/pulse && movement move publish --assume-yes
cd contracts/poll && movement move publish --assume-yes
cd contracts/swap && movement move publish --assume-yes
```

## Networks

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Mainnet | 126 | https://full.mainnet.movementinfra.xyz/v1 |
| Testnet | 250 | https://testnet.movementnetwork.xyz/v1 |

## Resources

- [Movement Docs](https://docs.movementnetwork.xyz)
- [Move Language Book](https://move-language.github.io/move/)
