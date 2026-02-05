# zkDEX D1 Private Voting

> Zero-knowledge commit-reveal voting with hidden ballot choices

## Overview

D1 Private Voting implements the [zkDEX D1 specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md) for privacy-preserving DAO governance.

### Security Properties

- **Privacy**: Vote choice hidden until reveal phase
- **Anti-Coercion**: Voters cannot prove their selection to bribers
- **Double-Spend Prevention**: Nullifier derived from `hash(sk, proposalId)` prevents reuse

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    D1 Private Voting                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Commit    │───▶│   Reveal    │───▶│   Tally     │     │
│  │   Phase     │    │   Phase     │    │   Results   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│        │                  │                                 │
│        ▼                  ▼                                 │
│  ┌─────────────┐    ┌─────────────┐                        │
│  │  ZK Proof   │    │   Verify    │                        │
│  │  (Groth16)  │    │  Commitment │                        │
│  └─────────────┘    └─────────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### ZK Circuit (6 Verification Stages)

| Stage | Verification | Description |
|-------|--------------|-------------|
| 1 | Token Note | `noteHash = hash(pkX, pkY, noteValue, tokenType, noteSalt)` |
| 2 | Snapshot Inclusion | 20-level Merkle proof of token ownership |
| 3 | Ownership Proof | Secret key derives public key (Baby Jubjub) |
| 4 | Power Matching | `votingPower === noteValue` |
| 5 | Choice Validation | Vote is 0 (against), 1 (for), or 2 (abstain) |
| 6 | Commitment Binding | `commitment = hash(choice, votingPower, proposalId, voteSalt)` |

### Public Inputs (4 as per D1 spec)

```
voteCommitment  - Hash binding vote choice and salt
proposalId      - Proposal identifier
votingPower     - Disclosed voting strength
merkleRoot      - Snapshot eligibility tree root
```

## Live Contract

| Network | Address |
|---------|---------|
| Sepolia | `0x583e8926F8701a196F182c449dF7BAc4782EF784` |

## Quick Start

```bash
# Clone
git clone https://github.com/tokamak-network/zk-dex-d1-private-voting
cd zk-dex-d1-private-voting

# Install
npm install

# Run frontend
npm run dev
```

Open http://localhost:5173

### Compile ZK Circuit (Optional)

```bash
cd circuits
./compile.sh
```

Requires: [circom](https://docs.circom.io/getting-started/installation/), [snarkjs](https://github.com/iden3/snarkjs)

## Project Structure

```
├── circuits/
│   ├── PrivateVoting.circom   # ZK circuit (~150K constraints)
│   └── compile.sh             # Circuit compilation script
├── contracts/
│   └── PrivateVoting.sol      # Commit-reveal voting contract
├── src/
│   ├── App.tsx                # Main application (commit-reveal UI)
│   ├── App.css                # Styles
│   ├── contract.ts            # Contract ABI & address
│   ├── zkproof.ts             # ZK proof generation module
│   └── wagmi.ts               # Wallet configuration
└── docs/
    ├── ARCHITECTURE.md
    ├── TECH_STACK.md
    └── TESTING.md
```

## How It Works

### Commit Phase

1. Select vote choice (For / Against / Abstain)
2. Generate ZK proof proving:
   - Token ownership in snapshot
   - Valid vote commitment
   - Correct voting power
3. Submit commitment + proof on-chain
4. Nullifier prevents double voting

### Reveal Phase

1. After commit phase ends, reveal choice and salt
2. Contract verifies: `hash(choice, votingPower, proposalId, voteSalt) == commitment`
3. Vote is tallied

### Privacy Guarantees

| On-chain (Public) | Off-chain (Secret) |
|-------------------|-------------------|
| Commitment hash | Vote choice |
| Voting power | Vote salt |
| Nullifier | Secret key |
| Merkle root | Merkle path |

## Tech Stack

- **ZK Circuit**: Circom 2.1.6, Groth16
- **Cryptography**: Poseidon hash, Baby Jubjub curve
- **Frontend**: React, TypeScript, Vite
- **Web3**: wagmi, viem
- **Contract**: Solidity 0.8.24
- **Network**: Ethereum Sepolia Testnet

## Requirements

- Node.js 18+
- MetaMask wallet
- Sepolia ETH (for gas fees)

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Tech Stack](./docs/TECH_STACK.md)
- [Testing Guide](./docs/TESTING.md)

## References

- [D1 Private Voting Specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [zkDEX Documentation](https://github.com/tokamak-network/zk-dex/tree/circom/docs/future)
- [Tokamak Network](https://tokamak.network)

## License

MIT
