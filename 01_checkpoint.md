# MVPulse - Checkpoint 1 Submission

## Project Overview

**MVPulse** is a decentralized polling and rewards platform built on Movement Network. It enables users to create polls, vote, and earn rewards in MOVE or PULSE tokens, with a comprehensive gamification system featuring tiers, quests, and seasonal competitions.

**Live Demo:** Deployed on Movement Testnet
**Repository:** mvpulse/mvpulse

---

## System Architecture

```
mvpulse/
├── contracts/               # Move smart contracts (on-chain)
│   ├── pulse/              # PULSE token (Fungible Asset)
│   ├── poll/               # Polling system with rewards
│   └── swap/               # PULSE/USDC AMM swap
│
└── frontend/               # Full-stack React application
    ├── client/             # React + Vite frontend
    │   ├── components/     # Reusable UI components
    │   ├── pages/          # Application pages
    │   ├── hooks/          # Custom React hooks
    │   └── contexts/       # React contexts
    │
    ├── server/             # Express.js backend
    │   ├── routes.ts       # API endpoints
    │   └── index.ts        # Server entry point
    │
    └── shared/             # Shared types and schema
        └── schema.ts       # Drizzle ORM database schema
```

---

## Smart Contracts (On-Chain)

### 1. PULSE Token (`contracts/pulse`)
- **Type:** Fungible Asset (FA) standard
- **Max Supply:** 1 billion PULSE
- **Features:**
  - Testnet faucet for development
  - Standard FA operations (transfer, mint, burn)

**Deployed Address:** `0x69c7c6752b3426e00fec646270e5b7e9f0efa18bddbd7f112a8e84f7fbe3f737`

### 2. Poll Contract (`contracts/poll`)
- **Features:**
  - Create polls with MOVE or PULSE rewards
  - Multiple reward distribution modes:
    - Fixed per vote
    - Equal split among voters
  - Platform fee (2%) for sustainability
  - Manual claim or automatic distribution
  - Vote tracking and result tallying

**Deployed Address:** `0x306980d338caa4537e109afdc15f7f749b5948c9e69ec0178a7527363cdca70e`

### 3. Swap Contract (`contracts/swap`)
- **Type:** AMM (Automated Market Maker)
- **Features:**
  - PULSE/USDC token swap
  - Constant product (x*y=k) market maker
  - Liquidity provision with LP shares
  - Fee collection mechanism

**Deployed Address:** `0x55872704413ffc43bb832df7eb14c0665c9ae401897077a262d56e2de37d2b7e`

---

## Frontend Application

### Technology Stack
- **Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui components
- **State Management:** TanStack React Query
- **Database:** PostgreSQL (Neon Serverless) + Drizzle ORM
- **Wallet Integration:** Privy + Movement Wallet Adapters
- **Backend:** Express.js with TypeScript

### Pages Implemented

#### Public Pages
| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Landing page with platform overview |
| Projects | `/projects` | Browse all active polls |
| Poll Details | `/poll/:id` | View poll, vote, claim rewards |
| Leaderboard | `/leaderboard` | Season rankings and points |
| Swap | `/swap` | PULSE/USDC token swap interface |
| Wallet | `/wallet` | View balances and transaction history |

#### Creator Dashboard
| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/creator` | Overview of created polls and stats |
| Manage Polls | `/creator/manage` | List and manage all polls |
| Manage Poll | `/creator/manage/:pollId` | Edit specific poll settings |
| Distributions | `/creator/distributions` | Track reward distributions |
| Quest Manager | `/creator/quests` | Create and manage quests |

#### Participant Dashboard
| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/participant` | Voting stats, tier, and streak info |
| Quests | `/participant/quests` | View and complete quests |
| Voting History | `/participant/history` | Past votes and rewards |
| Rewards | `/participant/rewards` | Claim pending rewards |

### Key Features

#### 1. Multi-Wallet Support
- Petra Wallet
- Nightly Wallet
- Martian Wallet
- Pontem Wallet
- Privy (Email/Social login)
- Auto-funding on testnet

#### 2. Poll System
- Create polls with customizable options
- Fund polls with MOVE or PULSE tokens
- Multiple reward distribution strategies
- Real-time vote counting
- Reward claiming interface

#### 3. Token Swap
- AMM-based PULSE/USDC swap
- Price impact calculation
- Slippage tolerance settings
- Liquidity provision

#### 4. Guided Tour
- Interactive onboarding for new users
- Step-by-step feature walkthrough
- Skip and resume functionality

---

## Gamification System (Quest & Tier)

### Tier System
| Tier | PULSE Threshold | Daily Vote Limit |
|------|-----------------|------------------|
| Bronze | 0 | 3 votes/day |
| Silver | 1,000 PULSE | 6 votes/day |
| Gold | 10,000 PULSE | 9 votes/day |
| Platinum | 100,000 PULSE | 12 votes/day |

**Streak Bonuses:**
- 7+ day streak: +1 tier bonus
- 30+ day streak: +2 tier bonus

### Quest System
- **Quest Types:** Daily, Weekly, Achievement, Special
- **Quest Templates:** 10 pre-built templates for creators
- **Actions Tracked:** Votes, streaks, reward claims
- **Points System:** Earn points for completing quests

### Seasons
- Time-bounded competition periods
- Points accumulation throughout season
- Leaderboard rankings
- PULSE rewards at season end

---

## Database Schema

### Tables
| Table | Purpose |
|-------|---------|
| `user_profiles` | User tier, streak, vote tracking |
| `seasons` | Season definitions and status |
| `quests` | Quest definitions by creators |
| `quest_progress` | User progress on quests |
| `daily_vote_logs` | Daily vote tracking for streaks |
| `season_leaderboard` | Cached leaderboard rankings |

---

## API Endpoints

### User & Profile
- `GET /api/user/profile/:address` - Get user profile with tier
- `POST /api/user/sync-tier/:address` - Recalculate tier

### Voting
- `GET /api/votes/remaining/:address` - Get remaining daily votes
- `POST /api/votes/record/:address` - Record vote and update progress

### Quests
- `GET /api/quests/active/:seasonId` - Get active quests
- `GET /api/quests/creator/:address` - Get creator's quests
- `GET /api/quests/progress/:address/:seasonId` - Get quest progress
- `POST /api/quests` - Create new quest
- `POST /api/quests/claim/:address/:questId` - Claim quest points

### Seasons
- `GET /api/seasons/current` - Get current active season
- `POST /api/seasons` - Create new season
- `PATCH /api/seasons/:seasonId/status` - Update season status
- `GET /api/seasons/:id/leaderboard` - Get season leaderboard

---

## Development Progress

### Completed Features
- [x] PULSE token contract with faucet
- [x] Poll contract with reward distribution
- [x] Swap contract with AMM functionality
- [x] Multi-wallet integration (Privy + native wallets)
- [x] Poll creation and voting flow
- [x] Token swap interface
- [x] Creator dashboard with poll management
- [x] Participant dashboard with voting history
- [x] Reward claiming system
- [x] Guided tour onboarding
- [x] Tier system with PULSE-based levels
- [x] Daily vote limits per tier
- [x] Streak tracking and bonuses
- [x] Quest system with templates
- [x] Season management
- [x] Leaderboard with rankings

### In Progress
- [ ] On-chain season contract deployment
- [ ] PULSE distribution at season end
- [ ] Advanced analytics dashboard

---

## Network Configuration

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Mainnet | 126 | https://full.mainnet.movementinfra.xyz/v1 |
| Testnet | 250 | https://testnet.movementnetwork.xyz/v1 |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Movement CLI
- PostgreSQL database (or Neon account)

### Installation

```bash
# Clone repository
git clone https://github.com/mvpulse/mvpulse.git
cd mvpulse

# Install frontend dependencies
cd frontend
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Run database migrations
npx drizzle-kit push

# Start development server
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Contract Addresses (Testnet)
VITE_TESTNET_CONTRACT_ADDRESS=0x306980d...
VITE_TESTNET_PULSE_CONTRACT_ADDRESS=0x69c7c67...
VITE_TESTNET_SWAP_CONTRACT_ADDRESS=0x5587270...

# Privy
VITE_PRIVY_APP_ID=your_privy_app_id
```

---

## Team

MVPulse is built as part of the Movement Network hackathon/builder program.

---

## License

MIT License

---

*Last Updated: December 6, 2024*
