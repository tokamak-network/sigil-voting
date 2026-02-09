# zkDEX Private Voting (D1 + D2)

> Zero-knowledge voting with D1 (Private Voting) and D2 (Quadratic Voting)

## Overview

This project implements two ZK voting systems from the zkDEX specification:

| Spec | Name | Description |
|------|------|-------------|
| **D1** | Private Voting | 1:1 voting power, commit-reveal with ZK proof |
| **D2** | Quadratic Voting | Cost = votes², anti-whale mechanism |

## D2 Quadratic Voting

Quadratic voting prevents whale domination by making each additional vote exponentially expensive:

| Votes | Cost (votes²) | Example |
|-------|---------------|---------|
| 1 | 1 credit | Small holder |
| 10 | 100 credits | Medium holder |
| 100 | 10,000 credits | Whale (expensive!) |

This ensures fair governance where wealth doesn't equal proportional power.

## Test Results

| Test | Result |
|------|--------|
| D1 Solidity tests | 28 passed |
| D2 Integration test | 3 passed |
| D2 Quadratic cost verification | Alice: 1000 → 10 votes → 900 remaining |

## Live Contracts (Sepolia)

### Unified Contract (D1 + D2)

| Contract | Address |
|----------|---------|
| **ZkVotingFinal** | [`0xFef153ADfC04790906a8dF8573545E9b7589fa58`](https://sepolia.etherscan.io/address/0xFef153ADfC04790906a8dF8573545E9b7589fa58) |
| VerifierD1 | [`0xe4E6CFD30a945990Eca672a751410252b1AA903E`](https://sepolia.etherscan.io/address/0xe4E6CFD30a945990Eca672a751410252b1AA903E) |
| VerifierD2 | [`0xF4e9238Da28e3Fa9D8888A5D0Df078c02E5a45E4`](https://sepolia.etherscan.io/address/0xF4e9238Da28e3Fa9D8888A5D0Df078c02E5a45E4) |
| PoseidonT5 | [`0x555333f3f677Ca3930Bf7c56ffc75144c51D9767`](https://sepolia.etherscan.io/address/0x555333f3f677Ca3930Bf7c56ffc75144c51D9767) |

### Legacy D1 Contract

| Contract | Address |
|----------|---------|
| PrivateVoting | [`0xc3bF134b60FA8ac7366CA0DeDbD50ECd9751ab39`](https://sepolia.etherscan.io/address/0xc3bF134b60FA8ac7366CA0DeDbD50ECd9751ab39) |
| Groth16Verifier | [`0x4E510852F416144f0C0d7Ef83F0a4ab28aCba864`](https://sepolia.etherscan.io/address/0x4E510852F416144f0C0d7Ef83F0a4ab28aCba864) |

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
# D1 tests (Foundry)
forge test -vv

# D2 integration test (Hardhat)
npx hardhat test test/D2_Integration.test.cjs
```

## Tech Stack

- **Circuit**: Circom 2.1.6 (Groth16)
- **Contract**: Solidity 0.8.24 + Hardhat
- **Frontend**: React + Viem + Wagmi
- **Hash**: Poseidon (circomlibjs)
- **Curve**: Baby JubJub

## Implemented Features

### D1 Private Voting
- Commit-Reveal voting with ZK proof
- Double-vote prevention (nullifier)
- Auto-registration with dynamic voter snapshots

### D2 Quadratic Voting
- Quadratic cost: `creditsSpent = numVotes²`
- Credit burning mechanism
- Anti-whale protection
- ZK proof for vote privacy

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 ZkVotingFinal                   │
├─────────────────────┬───────────────────────────┤
│   D1 Functions      │      D2 Functions         │
│   - castVoteD1()    │      - castVoteD2()       │
│   - revealVoteD1()  │      - revealVoteD2()     │
│   - createProposalD1│      - createProposalD2   │
├─────────────────────┼───────────────────────────┤
│   VerifierD1        │      VerifierD2           │
│   (Groth16)         │      (Groth16)            │
└─────────────────────┴───────────────────────────┘
```

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic-voting.md)

## License

MIT
