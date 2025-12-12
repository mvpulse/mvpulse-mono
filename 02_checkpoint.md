# MVPulse - Checkpoint 2 Submission

## Project Overview

**MVPulse** is a decentralized polling and rewards platform built on Movement Network. The platform enables users to create polls, vote, and earn rewards in MOVE or PULSE tokens, with an integrated AMM swap for token exchange.

**Repository:** [github.com/mvpulse](https://github.com/mvpulse/mvpulse)

---

## What We Built

### 1. Smart Contracts (Move Language)

We developed and deployed three core smart contracts on Movement Network Testnet:

#### PULSE Token Contract (`pulse::pulse`)
- **Address:** `0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737`
- Custom Fungible Asset (FA) token with 1 billion max supply
- Testnet faucet functionality (1000 PULSE per call)
- One-time treasury mint with permanent minting disable mechanism
- Standard transfer and burn capabilities

#### Poll Contract (`poll::poll`)
- **Address:** `0x306980d338caa4537e109afdc15f7f749b5948c9e69ec0178a7527363cdca70e`
- Create polls with MOVE or PULSE token rewards
- Multiple reward distribution modes:
  - **Fixed per vote:** Set amount per participant
  - **Equal split:** Divide pool equally among voters
- Two distribution mechanisms:
  - **Manual Pull:** Participants claim their own rewards
  - **Manual Push:** Creator triggers batch distribution
- Platform fee system (2% default) for sustainability
- Dual vault architecture supporting both legacy Coin and Fungible Asset standards

#### Swap Contract (`swap::swap`)
- **Address:** `0x55872704413ffc43bb832df7eb14c0665c9ae401897077a262d56e2de37d2b7e`
- AMM-based PULSE/USDC swap using constant product formula (x*y=k)
- Liquidity provision with LP share tracking
- Configurable swap fees (default 0.3%)
- Slippage protection and price impact calculations

### 2. Frontend dApp (React + Vite + TypeScript)

A complete web application with the following features:

#### Wallet Integration
- Multi-wallet support: Petra, Nightly, Martian, Pontem
- **Privy integration** for embedded wallet with social login (Google, Discord, Twitter)
- **Shinami gas station** for gasless transactions via sponsored wallets
- Auto-funding on testnet for new wallets
- Fund transfer confirmation dialogs for Privy-signed transactions

#### Creator Dashboard
- Poll creation wizard with token selection (MOVE/PULSE)
- Poll management interface (view, close, distribute rewards)
- Reward distribution controls
- Season and quest management system

#### Participant Interface
- Browse and vote on active polls
- Claim rewards from completed polls
- View voting history and earned rewards
- Quest participation with side panel details

#### Token Features
- PULSE faucet for testnet
- Token balance display (MOVE, PULSE, USDC)
- Token swap interface with price quotes and slippage settings

#### UX Enhancements
- **Guided tour system** using react-joyride for onboarding
- **AI Assistant** for user support and guidance
- Responsive design for mobile and desktop

---

## Development Timeline

| Date | Milestone |
|------|-----------|
| Dec 3 | Initial commit, contract compilation, frontend integration |
| Dec 4 | Platform fee system, creator/participant pages, poll management |
| Dec 5 | Privy wallet integration, PULSE token (FA), token swap, wallet page, rewards claiming |
| Dec 6 | Guided tour system, quest system (manager, seasons), AI assistant |
| Dec 7 | Shinami gas station integration, fund transfer confirmations |
| Dec 8 | Quest page improvements with side panel |

---

## Technical Highlights

### Move Smart Contract Development
- Implemented the **Fungible Asset (FA) standard** for PULSE token (modern Aptos token standard)
- Supported both **legacy Coin** (AptosCoin/MOVE) and **FA tokens** in the poll contract
- Used **ExtendRef pattern** for secure store management in swap contract
- Implemented **k-invariant validation** for AMM swap security

### Frontend Architecture
- React 18 with TypeScript for type safety
- Vite for fast development and optimized builds
- TailwindCSS for responsive styling
- React Query for efficient data fetching and caching
- Privy SDK for embedded wallet experience
- Shinami SDK for gas sponsorship

### Web3 Integration
- Direct integration with Movement Network RPC
- Transaction simulation before execution
- Real-time balance updates
- Multi-network support (testnet/mainnet ready)

---

## Deployed Contract Addresses (Testnet)

| Contract | Address |
|----------|---------|
| PULSE Token | `0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737` |
| Poll System | `0x306980d338caa4537e109afdc15f7f749b5948c9e69ec0178a7527363cdca70e` |
| Swap AMM | `0x55872704413ffc43bb832df7eb14c0665c9ae401897077a262d56e2de37d2b7e` |

---

## Key Features Summary

1. **Decentralized Polling** - Create and participate in on-chain polls with token rewards
2. **Dual Token Support** - Use either native MOVE or custom PULSE tokens
3. **AMM Swap** - Exchange tokens with automated market making
4. **Embedded Wallets** - Privy integration for Web2-like onboarding
5. **Gasless Transactions** - Shinami gas sponsorship for better UX
6. **Quest System** - Gamified engagement with seasons and rewards
7. **Guided Onboarding** - Interactive tours for new users

---

## Git Commit History

```
3218602 - add side panel to participant quest page
7d91747 - add peer dependency for npm install (joyride)
d16604a - Merge: add-shinami (gasless transactions)
303a76f - add fund transfer confirmation dialogs
15815f0 - add navigation link to settings in WalletButton
7d353d2 - add shinami gas station
bb79724 - Merge: quests feature
74c2903 - enhanced AI assistant
4e866b2 - add season creator
80c22ce - add quest manager
a926a43 - initial quests version
9fdf61b - Merge: guided-tour feature
b1f96e7 - bug fix for guided tour - skip missing steps
ec7b914 - build error fix
9371cdb - Merge: participant-rewards
29d6e33 - bug fix for participant rewards wallet connection
a7a1894 - update readme
ef05a3e - Merge: separate-contracts
83dd5d5 - Merge: add-swap (AMM)
546ca5c - bug fix for claim rewards
7ad6b6f - add PULSE faucet
c19c604 - separate contracts into modules
b53112e - displaying token balances
ce57f82 - convert legacy coin to FA
7f35c84 - add PULSE token
f8869c6 - add wallet page
fc11d41 - add privy wallet integration with autofunding
c9fd9f6 - add manage poll
1027609 - add creator and participant pages
2084a23 - introduced platform fee and funding of polls
0e6bcd7 - working frontend and contract integration
bcc56cd - initial commit
```

---

## Next Steps

- Mainnet deployment preparation
- Additional quest types and rewards
- Enhanced analytics dashboard
- Community governance features
- Mobile app development

---

*Built for the Encode x Movement Hackathon*
