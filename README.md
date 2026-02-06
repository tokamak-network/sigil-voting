# zkDEX D1 Private Voting

> Zero-knowledge voting demo based on D1 spec

## Overview

D1 Private Voting implements the [zkDEX D1 specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md).

## Verified

| Item | Result |
|------|--------|
| Solidity tests | 28 passed |
| Vote tx | 4 succeeded |
| Cross-account voting | 2 different addresses |
| ZK Proof on-chain verification | Groth16 → Solidity Verifier passed |

## Live Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| PrivateVoting | `0xc3bF134b60FA8ac7366CA0DeDbD50ECd9751ab39` |
| Groth16Verifier | `0x4E510852F416144f0C0d7Ef83F0a4ab28aCba864` |

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

## Tech Stack

- **Circuit**: Circom (Groth16)
- **Contract**: Solidity + Foundry
- **Frontend**: React + Viem + Wagmi
- **Hash**: Poseidon

## Next Steps (Not Yet Tested)

- Reveal phase
- Double-vote prevention
- Real token integration
- UI improvements

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [Contract on Etherscan](https://sepolia.etherscan.io/address/0xc3bF134b60FA8ac7366CA0DeDbD50ECd9751ab39)

## License

MIT
