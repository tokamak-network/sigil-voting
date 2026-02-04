# zkDEX D1 Private Voting

> Zero-knowledge proof based private voting system for DAO governance.

## Overview

Commit-reveal voting with hidden choices, preventing vote buying and coercion while maintaining verifiable voting power.

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

# Run
npm run dev
```

Open http://localhost:5173

## Requirements

- Node.js 18+
- MetaMask wallet
- Sepolia ETH (for gas fees)

## How It Works

```
1. Select Choice     →  For / Against / Abstain
2. Generate Hash     →  keccak256(choice + salt)
3. Submit On-chain   →  Only commitment hash recorded
4. Verify on Etherscan
```

### Why Private?

| On-chain (Public) | Off-chain (Secret) |
|-------------------|-------------------|
| Commitment hash | Actual choice |
| Voting power | Salt value |
| Timestamp | Choice + salt combination |

The commitment hash cannot be reversed to reveal the original vote.

## Project Structure

```
├── contracts/          # Solidity smart contracts
│   └── PrivateVoting.sol
├── src/
│   ├── App.tsx        # Main application
│   ├── contract.ts    # Contract ABI & address
│   └── wagmi.ts       # Wallet configuration
└── docs/
    ├── ARCHITECTURE.md
    ├── TECH_STACK.md
    └── TESTING.md
```

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Web3**: wagmi, viem
- **Contract**: Solidity 0.8.24
- **Network**: Ethereum Sepolia Testnet

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Tech Stack](./docs/TECH_STACK.md)
- [Testing Guide](./docs/TESTING.md)

## Related

- [zkDEX D1 Specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [Tokamak Network](https://tokamak.network)

## License

MIT
