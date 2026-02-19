# SIGIL

> Private Voting Infrastructure — Permanently Secret Votes, Anti-Collusion, Quadratic Fairness

## What is SIGIL?

SIGIL is a ZK-based voting protocol that combines three technologies into one service:

| Technology | What it does |
|-----------|-------------|
| **D1 Private Voting** | Individual votes are permanently secret (no reveal phase) |
| **D2 Quadratic Voting** | Prevents whale domination (cost = votes²) |
| **MACI Anti-Collusion** | Key Change mechanism defeats bribery and coercion |

No other protocol combines all three. SIGIL is designed as an SDK/Widget platform so any DAO, DeFi, or NFT community can integrate private voting into their governance.

## How It Works

### For Users
1. Connect wallet
2. Sign up with one click (EdDSA key derived from wallet)
3. Choose a proposal, pick For/Against, set vote weight
4. Done — your vote is encrypted and permanently private

### Under the Hood
```
User votes → EdDSA sign → DuplexSponge encrypt → on-chain message
                                                        ↓
                              Coordinator (auto-runner, 30s polling)
                                                        ↓
                    Merge AccQueues → Process messages (reverse order)
                                                        ↓
                         Groth16 ZK proofs → On-chain verification
                                                        ↓
                              Tally results (aggregate only, no individual votes)
```

Key Change defense: If someone forces you to vote a certain way, you can change your MACI key afterward. Only the **last key's vote counts** — the coercer can never tell if their forced vote was overridden.

## Quadratic Voting

Prevents wealthy voters from dominating:

| Votes | Cost (credits) |
|-------|---------------|
| 1 | 1 |
| 3 | 9 |
| 5 | 25 |
| 10 | 100 |

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| **MACI** | [`0x56f81f9ff308c85287A2fF8F91BB6e9039Ec78f5`](https://sepolia.etherscan.io/address/0x56f81f9ff308c85287A2fF8F91BB6e9039Ec78f5) |
| MsgProcessor Verifier | [`0x47221B605bF18E92296850191A0c899fe03A27dB`](https://sepolia.etherscan.io/address/0x47221B605bF18E92296850191A0c899fe03A27dB) |
| Tally Verifier | [`0xa48c2bD789EAd236fFEE36dEad220DFFE3feccF1`](https://sepolia.etherscan.io/address/0xa48c2bD789EAd236fFEE36dEad220DFFE3feccF1) |
| VkRegistry | [`0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C`](https://sepolia.etherscan.io/address/0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C) |
| Gatekeeper | [`0x4c18984A78910Dd1976d6DFd820f6d18e7edD672`](https://sepolia.etherscan.io/address/0x4c18984A78910Dd1976d6DFd820f6d18e7edD672) |
| VoiceCreditProxy (ERC20) | [`0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00`](https://sepolia.etherscan.io/address/0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00) |
| TON Token | [`0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`](https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044) |

## Quick Start

### Frontend
```bash
npm install
npm run dev
```
Open http://localhost:5173

### Coordinator (Auto-Runner)
```bash
cd coordinator
npm install
npx tsx src/run.ts
```
Requires `.env` in the project root with `PRIVATE_KEY` and `COORDINATOR_PRIVATE_KEY`.

The coordinator polls for ended votes every 30 seconds and automatically processes messages, generates Groth16 proofs, and publishes tally results on-chain.

### Tests
```bash
# Smart contracts (Foundry)
forge test                  # 50 tests

# Crypto + circuits + frontend (Vitest)
npx vitest run              # 66 tests
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite 7 + Wagmi 3)             │
│  - Wallet connect, EdDSA key derivation              │
│  - DuplexSponge encryption, vote submission           │
│  - i18n (KO/EN), proposal list, credit tracking       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  Smart Contracts (Solidity 0.8.24)                   │
│  MACI → Poll → MessageProcessor → Tally             │
│  - AccQueue (quinary Merkle tree)                     │
│  - Groth16 on-chain verification                      │
│  - Token-gated proposal creation                      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  Coordinator (TypeScript)                            │
│  - Auto-Runner: poll → merge → process → prove → tally │
│  - In-circuit DuplexSponge decryption                 │
│  - Reverse-order message processing (MACI spec)       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  ZK Circuits (Circom 2.2, Groth16)                 │
│  - MessageProcessor: EdDSA verify + decrypt + state   │
│  - TallyVotes: aggregate counting with commitment     │
│  - SHA256Hasher, QuinaryMerkleProof, DuplexSponge     │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Circuits | Circom 2.2, Groth16 (snarkjs) |
| Contracts | Solidity 0.8.24, Foundry |
| Frontend | React 19, Vite 7, Wagmi 3, TypeScript |
| Crypto | Poseidon hash, Baby Jubjub (EdDSA), DuplexSponge |
| Network | Ethereum Sepolia testnet |

## Security Properties (MACI)

1. **Collusion Resistance** — Key Change makes bribe verification impossible
2. **Receipt-freeness** — No way to prove how you voted
3. **Privacy** — Individual votes are never revealed, only aggregate results
4. **Uncensorability** — All valid messages are processed
5. **Unforgeability** — EdDSA signatures prevent vote tampering
6. **Non-repudiation** — Signed votes cannot be denied
7. **Correct Execution** — Groth16 proofs guarantee honest computation

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md)
- [MACI Protocol (PSE)](https://maci.pse.dev)
- [Tokamak Network](https://tokamak.network)

## License

MIT
