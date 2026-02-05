# zkDEX D1 Private Voting

> Zero-knowledge commit-reveal voting with hidden ballot choices

## Overview

D1 Private Voting implements the [zkDEX D1 specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md) for privacy-preserving DAO governance.

### Security Properties

- **Privacy**: Vote choice hidden until reveal phase
- **Anti-Coercion**: Voters cannot prove their selection to bribers
- **Double-Spend Prevention**: Nullifier derived from `hash(sk, proposalId)` prevents reuse

## Test Status

```
28 tests passed, 0 failed
├── Contract Logic Tests: 24 passed
└── Real ZK Proof Tests:   4 passed
```

| Test Category | Tests | Status |
|---------------|-------|--------|
| Merkle Root Registration | 2 | ✅ |
| Proposal Creation | 3 | ✅ |
| Commit Phase | 6 | ✅ |
| Reveal Phase | 9 | ✅ |
| Phase Transitions | 3 | ✅ |
| Full Integration | 1 | ✅ |
| Real Groth16 Proof | 4 | ✅ |

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
| 1 | Token Note | `noteHash = Poseidon(pkX, pkY, noteValue, tokenType, noteSalt)` |
| 2 | Snapshot Inclusion | 20-level Merkle proof of token ownership |
| 3 | Ownership Proof | Secret key derives public key (Baby Jubjub) |
| 4 | Power Matching | `votingPower === noteValue` |
| 5 | Choice Validation | Vote is 0 (against), 1 (for), or 2 (abstain) |
| 6 | Commitment Binding | `commitment = Poseidon(choice, votingPower, proposalId, voteSalt)` |

### Circuit Stats

```
Constraints: 16,620 (non-linear: 9,732 / linear: 6,888)
Public Inputs: 4
Private Inputs: 30
```

### Public Inputs (4 as per D1 spec)

```
voteCommitment  - Hash binding vote choice and salt
proposalId      - Proposal identifier
votingPower     - Disclosed voting strength
merkleRoot      - Snapshot eligibility tree root
```

## Live Contracts

| Network | Contract | Address |
|---------|----------|---------|
| Sepolia | PrivateVoting | `0xE39b93A5e560F5DBF2E551fA5341E6Ba97Bc5198` |
| Sepolia | Groth16Verifier | `0xBab35D124355F2F66D36D7D9FC56adD7dc2cE874` |

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

### Run Tests

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Run all tests (28 tests)
forge test -vv
```

### Compile ZK Circuit

```bash
cd circuits
npm install
circom PrivateVoting.circom --r1cs --wasm --sym -o build/ -l node_modules
```

### Generate & Verify Proof

```bash
cd circuits/build

# Generate valid inputs
node generate_input.js > input.json

# Generate witness
node PrivateVoting_js/generate_witness.js PrivateVoting_js/PrivateVoting.wasm input.json witness.wtns

# Generate proof
snarkjs groth16 prove PrivateVoting_final.zkey witness.wtns proof.json public.json

# Verify proof
snarkjs groth16 verify verification_key.json public.json proof.json
# Output: [INFO] snarkJS: OK!
```

## Project Structure

```
├── circuits/
│   ├── PrivateVoting.circom      # ZK circuit (D1 spec)
│   ├── build/
│   │   ├── PrivateVoting.r1cs    # Compiled constraints
│   │   ├── PrivateVoting_js/     # WASM witness calculator
│   │   ├── PrivateVoting_final.zkey  # Proving key
│   │   ├── verification_key.json # Verification key
│   │   ├── Verifier.sol          # Generated Solidity verifier
│   │   └── generate_input.js     # Test input generator
│   └── compile.sh
├── contracts/
│   ├── PrivateVoting.sol         # Commit-reveal voting contract
│   └── Groth16Verifier.sol       # On-chain verifier
├── test/
│   ├── PrivateVoting.t.sol       # Contract tests (24)
│   └── RealProof.t.sol           # Real ZK proof tests (4)
├── src/
│   ├── App.tsx                   # Frontend
│   ├── zkproof.ts                # ZK proof module
│   └── contract.ts               # Contract ABI
└── docs/
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
2. Contract verifies: `Poseidon(choice, votingPower, proposalId, voteSalt) == commitment`
3. Vote is tallied

### Privacy Guarantees

| On-chain (Public) | Off-chain (Secret) |
|-------------------|-------------------|
| Commitment hash | Vote choice |
| Voting power | Vote salt |
| Nullifier | Secret key |
| Merkle root | Merkle path |

## Gas Costs

| Function | Gas | Description |
|----------|-----|-------------|
| commitVote | ~207,000 | Submit ZK proof + commitment |
| revealVote | ~100,000 | Reveal choice + verify |
| **Total per vote** | **~307,000** | Complete voting cycle |

*Measured on Ethereum Sepolia (gas price varies)*

## Tech Stack

- **ZK Circuit**: Circom 2.1.6, Groth16
- **Cryptography**: Poseidon hash, Baby Jubjub curve
- **Testing**: Foundry (forge)
- **Frontend**: React, TypeScript, Vite
- **Web3**: wagmi, viem
- **Contract**: Solidity 0.8.24
- **Network**: Ethereum Sepolia Testnet

## Requirements

- Node.js 18+
- Foundry (for testing)
- circom 2.1.6+ (for circuit compilation)
- snarkjs (for proof generation)
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
