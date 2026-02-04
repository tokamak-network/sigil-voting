# zkDEX D1 Private Voting Demo

> Commit-reveal voting with hidden choices, preventing vote buying and coercion while maintaining verifiable voting power.

[![Demo](https://img.shields.io/badge/Demo-Live-green)](https://github.com/tokamak-network/zk-dex-d1-private-voting)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Overview

This is a demo implementation of the **zkDEX D1 Private Voting** module. It demonstrates how zero-knowledge proofs can be used to create a secret ballot system for DAO governance.

### Why Private Voting?

| Problem | Solution |
|---------|----------|
| Vote Buying | Commitment scheme prevents proving your choice |
| Social Pressure | Hidden ballots protect voter autonomy |
| Retaliation Risk | Individual choices remain secret forever |
| Last-minute Manipulation | Commit phase hides all choices until reveal |

### Key Features

- **ZK Private Voting**: Vote choices are encrypted using zero-knowledge proofs
- **Commit-Reveal Scheme**: Two-phase voting prevents vote buying and coercion
- **Nullifier System**: Prevents double voting with the same tokens
- **Verifiable Tallying**: Anyone can verify final results are correct
- **Multi-language Support**: Korean (KO) and English (EN) UI

## Screenshots

### Landing Page
- Hero section with value proposition
- Problem explanation (Why private voting?)
- How it works (4 steps)
- Benefits, Use Cases, Security features
- FAQ section

### Voting Flow
1. Select proposal
2. Choose: For / Against / Abstain
3. Generate ZK proof (simulated)
4. Submit commitment
5. View result in My Votes

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- MetaMask or any Web3 wallet

### Installation

```bash
# Clone the repository
git clone https://github.com/tokamak-network/zk-dex-d1-private-voting.git

# Navigate to project directory
cd zk-dex-d1-private-voting

# Install dependencies
npm install

# Start development server
npm run dev
```

### Access the Demo

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | System design and component structure |
| [Tech Stack](./docs/TECH_STACK.md) | Technologies and libraries used |
| [Testing Guide](./docs/TESTING.md) | How to test the demo |

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   SELECT    │ ──▶ │   COMMIT    │ ──▶ │   REVEAL    │ ──▶ │   TALLY     │
│   Choice    │     │   Phase     │     │   Phase     │     │   Results   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     │                    │                   │                    │
     ▼                    ▼                   ▼                    ▼
  For/Against/      hash(vote+salt)      Decrypt all         Final count
   Abstain          on-chain only        commitments          revealed
```

### Commit-Reveal Mechanism

1. **Commit Phase**: Voter submits `hash(choice + salt)` - no one can see the actual vote
2. **Reveal Phase**: After voting ends, commitments are decrypted for tallying
3. **Result**: Only aggregate results are public, individual choices stay secret

## Project Structure

```
zk-dex-d1-private-voting/
├── docs/
│   ├── ARCHITECTURE.md    # System design
│   ├── TECH_STACK.md      # Technologies used
│   └── TESTING.md         # Testing guide
├── src/
│   ├── App.tsx            # Main application
│   ├── App.css            # Styles
│   ├── wagmi.ts           # Wallet configuration
│   └── main.tsx           # Entry point
├── public/
├── package.json
└── README.md
```

## Use Cases

1. **Protocol Parameter Changes** - DAO votes on fee adjustments without whale influence
2. **Treasury Grant Allocation** - Fair project funding without bandwagon effects
3. **Contentious Decisions** - Express minority opinions without social pressure
4. **Board Elections** - Prevent vote trading between candidates

## Security Features

| Feature | Description |
|---------|-------------|
| Anti-Bribery | Cannot prove your vote to potential buyers |
| Nullifier | Unique per voter per proposal, prevents double voting |
| Snapshot | Historical merkle root prevents manipulation |

## Related Links

- [zkDEX D1 Specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [Tokamak Network](https://tokamak.network)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with Claude Code for Tokamak Network
