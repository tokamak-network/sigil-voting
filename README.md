# zkDEX D1 Private Voting Demo

ZK Private Voting Demo - Commit-reveal voting with hidden choices, preventing vote buying and coercion while maintaining verifiable voting power.

## Overview

This is a demo implementation of the zkDEX D1 Private Voting module. It demonstrates how zero-knowledge proofs can be used to create a secret ballot system for DAO governance.

### Key Features

- **ZK Private Voting**: Vote choices are encrypted and only final tallies are revealed
- **Commit-Reveal Scheme**: Prevents vote buying and coercion
- **Verifiable Voting Power**: Maintains transparent voting power while hiding choices
- **Multi-language Support**: Korean and English UI

## Tech Stack

- React 18 + TypeScript
- Vite
- wagmi (Wallet Connection)
- Thanos Sepolia Testnet

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/tokamak-network/zk-dex-d1-private-voting.git

# Navigate to project directory
cd zk-dex-d1-private-voting

# Install dependencies
npm install
```

### Running the Demo

```bash
# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

## How It Works

1. **Select**: Choose For, Against, or Abstain
2. **Generate ZK Proof**: Your choice is encrypted with a zero-knowledge proof
3. **Submit Commitment**: Only the encrypted commitment is recorded on-chain
4. **Tally Results**: After voting ends, only the final result is revealed

## Project Structure

```
src/
├── App.tsx          # Main application component
├── App.css          # Styles
├── wagmi.ts         # Wallet configuration
└── main.tsx         # Entry point
```

## Related Links

- [zkDEX D1 Specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [Tokamak Network](https://tokamak.network)

## License

MIT
