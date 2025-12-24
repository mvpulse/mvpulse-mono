# Poll Status Workflow

This document describes the lifecycle of a poll in the MVPulse platform.

## Status Values

| Status | Value | Description |
|--------|-------|-------------|
| `ACTIVE` | 0 | Poll is accepting votes |
| `CLOSED` | 1 | Claims/distributions stopped, grace period active |
| `CLAIMING_OR_DISTRIBUTION` | 2 | Participants can claim rewards or creator can distribute |
| `FINALIZED` | 3 | Poll complete, unclaimed rewards sent to treasury |

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POLL LIFECYCLE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌────────────┐
    │   ACTIVE   │  Poll is created and accepting votes
    │   (0)      │
    └─────┬──────┘
          │
          │  start_claims(poll_id, distribution_mode)
          │  - Creator selects distribution mode
          │  - MANUAL_PULL (0): Voters claim their own rewards
          │  - MANUAL_PUSH (1): Creator distributes to all voters
          │
          ▼
    ┌────────────────────────┐
    │ CLAIMING_OR_DISTRIBUTION│  Reward distribution phase
    │         (2)            │
    │                        │  MANUAL_PULL:
    │                        │  - Voters call claim_reward_move/pulse
    │                        │
    │                        │  MANUAL_PUSH:
    │                        │  - Creator calls distribute_rewards_move/pulse
    └─────────┬──────────────┘
              │
              │  close_poll(poll_id)
              │  - Stops all claims/distributions
              │  - Starts grace period timer
              │
              ▼
    ┌────────────┐
    │   CLOSED   │  Grace period active
    │   (1)      │
    │            │  Creator can:
    │            │  - withdraw_remaining (refund minus pending claims)
    │            │
    │            │  After grace period elapses:
    │            │  - finalize_poll becomes available
    └─────┬──────┘
          │
          │  finalize_poll_move/pulse(poll_id)
          │  - Only callable after grace period
          │  - Unclaimed rewards sent to treasury
          │
          ▼
    ┌────────────┐
    │ FINALIZED  │  Poll complete
    │   (3)      │
    └────────────┘
```

## Distribution Modes

### MANUAL_PULL (0) - Voters Claim
- Each voter calls `claim_reward_move` or `claim_reward_pulse`
- Unclaimed rewards remain in pool until finalization
- Best for: Large number of voters, gas efficiency (voters pay their own gas)

### MANUAL_PUSH (1) - Creator Distributes
- Creator calls `distribute_rewards_move` or `distribute_rewards_pulse`
- All voters receive rewards in a single transaction
- Best for: Small number of voters, guaranteed distribution

## Entry Functions by Status

### ACTIVE Status
| Function | Description |
|----------|-------------|
| `vote(poll_id, option_index)` | Cast a vote on the poll |
| `fund_poll_with_move/pulse(poll_id, amount)` | Add more rewards to the poll |
| `start_claims(poll_id, distribution_mode)` | Close voting and start distribution phase |

### CLAIMING_OR_DISTRIBUTION Status
| Function | Who | Description |
|----------|-----|-------------|
| `claim_reward_move(poll_id)` | Voters | Claim MOVE reward (MANUAL_PULL mode) |
| `claim_reward_pulse(poll_id)` | Voters | Claim PULSE reward (MANUAL_PULL mode) |
| `distribute_rewards_move(poll_id)` | Creator | Distribute MOVE to all voters (MANUAL_PUSH mode) |
| `distribute_rewards_pulse(poll_id)` | Creator | Distribute PULSE to all voters (MANUAL_PUSH mode) |
| `close_poll(poll_id)` | Creator | Stop claims/distributions, start grace period |

### CLOSED Status
| Function | Who | Description |
|----------|-----|-------------|
| `withdraw_remaining_move(poll_id)` | Creator | Withdraw excess rewards (minus pending claims) |
| `withdraw_remaining_pulse(poll_id)` | Creator | Withdraw excess rewards (minus pending claims) |
| `finalize_poll_move(poll_id)` | Creator | Finalize poll (only after grace period) |
| `finalize_poll_pulse(poll_id)` | Creator | Finalize poll (only after grace period) |

### FINALIZED Status
No actions available - poll is complete.

## Grace Period

The grace period is a configurable platform setting (default: 7 days) that:
1. Starts when the creator calls `close_poll`
2. Prevents immediate finalization, giving time for any pending claims
3. After elapsed, allows finalization which sends unclaimed rewards to treasury

Check if grace period has elapsed:
```move
can_finalize_poll(registry_addr, poll_id) -> bool
```

## Withdraw Remaining Logic

When a creator calls `withdraw_remaining` during CLOSED status:

**For MANUAL_PULL mode with fixed rewards:**
```
withdrawable = reward_pool - (unclaimed_voters × reward_per_vote)
```
This ensures enough funds remain for voters who haven't claimed yet.

**For MANUAL_PUSH mode or equal split:**
```
withdrawable = reward_pool
```
Since distribution already happened or wasn't selected.

## Example Workflow

### Scenario 1: MANUAL_PULL Distribution
```
1. Creator: create_poll_with_pulse(...)     → ACTIVE
2. Voters: vote(poll_id, option)            → ACTIVE
3. Creator: start_claims(poll_id, 0)        → CLAIMING_OR_DISTRIBUTION
4. Voters: claim_reward_pulse(poll_id)      → CLAIMING_OR_DISTRIBUTION
5. Creator: close_poll(poll_id)             → CLOSED (grace period starts)
6. Creator: withdraw_remaining_pulse(...)   → CLOSED (optional)
7. [Grace period elapses]
8. Creator: finalize_poll_pulse(poll_id)    → FINALIZED
```

### Scenario 2: MANUAL_PUSH Distribution
```
1. Creator: create_poll_with_move(...)       → ACTIVE
2. Voters: vote(poll_id, option)             → ACTIVE
3. Creator: start_claims(poll_id, 1)         → CLAIMING_OR_DISTRIBUTION
4. Creator: distribute_rewards_move(poll_id) → CLAIMING_OR_DISTRIBUTION
5. Creator: close_poll(poll_id)              → CLOSED (grace period starts)
6. [Grace period elapses]
7. Creator: finalize_poll_move(poll_id)      → FINALIZED
```

## View Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `get_poll(registry, poll_id)` | Poll struct | Full poll details including status |
| `has_voted(registry, poll_id, voter)` | bool | Check if address has voted |
| `has_claimed(registry, poll_id, claimer)` | bool | Check if address has claimed |
| `can_finalize_poll(registry, poll_id)` | bool | Check if grace period has elapsed |
| `get_claim_period(registry)` | u64 | Get grace period duration in seconds |

## Error Codes

| Error | Code | Description |
|-------|------|-------------|
| `E_POLL_CLOSED` | 0x3 | Poll is not in ACTIVE status |
| `E_POLL_NOT_CLAIMABLE` | 0x9 | Poll is not in CLAIMING_OR_DISTRIBUTION status |
| `E_POLL_NOT_ENDED` | 0x6 | Poll is not in CLOSED status |
| `E_POLL_NOT_IN_CLAIMING` | 0x16 | Poll is not in correct status for operation |
| `E_CLAIM_PERIOD_NOT_ELAPSED` | 0x14 | Grace period has not elapsed yet |
| `E_POLL_ALREADY_FINALIZED` | 0x15 | Poll is already finalized |
