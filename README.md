# zkDEX Private Voting (D1 + D2)

> Zero-Knowledge Quadratic Voting - Complex ZK logic, Simple UX

## Key Feature

**Non-developer friendly interface** - All ZK complexity is hidden from users. They just vote.

## How It Works

### For Users (Simple)
1. Connect wallet
2. Select proposal
3. Choose For/Against and vote intensity
4. Confirm and done

### Under the Hood (Complex)
- Commit-Reveal voting with ZK proofs
- Quadratic cost calculation (votes² = TON spent)
- Nullifier-based double-vote prevention
- Merkle tree voter verification

## D2 Quadratic Voting

Prevents whale domination:

| Votes | Cost (TON) |
|-------|------------|
| 1 | 1 |
| 5 | 25 |
| 10 | 100 |

## Voting Phases

| Phase | User Action |
|-------|-------------|
| **Commit** | Cast vote (hidden) |
| **Reveal** | Disclose vote for counting |
| **Ended** | View results |

## Live Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| **ZkVotingFinal** | [`0xAA09EF93ae7434568A9b6817d4df6083B2a27224`](https://sepolia.etherscan.io/address/0xAA09EF93ae7434568A9b6817d4df6083B2a27224) |
| TON Token | [`0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`](https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044) |
| VerifierD2 | [`0xF4e9238Da28e3Fa9D8888A5D0Df078c02E5a45E4`](https://sepolia.etherscan.io/address/0xF4e9238Da28e3Fa9D8888A5D0Df078c02E5a45E4) |
| PoseidonT5 | [`0x555333f3f677Ca3930Bf7c56ffc75144c51D9767`](https://sepolia.etherscan.io/address/0x555333f3f677Ca3930Bf7c56ffc75144c51D9767) |

## Quick Start

```bash
git clone https://github.com/tokamak-network/zk-dex-d1-private-voting
cd zk-dex-d1-private-voting
npm install
npm run dev
```

Open http://localhost:5174

## UX Features

- **Auto voter registration** - No manual setup required
- **Real-time balance display** - Shows available TON and max votes
- **Vote history** - View past votes with Etherscan links
- **Phase indicators** - Clear status of each proposal
- **One-shot warning** - Confirms irreversible vote action
- **Progress feedback** - Simple "Please wait" messages (no technical jargon)

## Tech Stack

- **Circuit**: Circom 2.1.6 (Groth16)
- **Contract**: Solidity 0.8.24
- **Frontend**: React + Vite + Wagmi
- **Hash**: Poseidon
- **Network**: Sepolia Testnet

## Architecture

```
User clicks "Vote"
       ↓
[Frontend] Generate ZK proof locally
       ↓
[Contract] Verify proof + store commitment
       ↓
[Reveal Phase] User discloses vote
       ↓
[Contract] Verify + count vote
```

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md)

## License

MIT
