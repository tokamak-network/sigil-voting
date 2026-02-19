<p align="center">
  <h1 align="center">SIGIL</h1>
</p>

<p align="center">
  <a href="https://github.com/tokamak-network/zk-dex-d1-private-voting/actions/workflows/test.yml"><img alt="CI" src="https://github.com/tokamak-network/zk-dex-d1-private-voting/actions/workflows/test.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" /></a>
  <img alt="Solidity" src="https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat-square&logo=solidity" />
  <img alt="Circom" src="https://img.shields.io/badge/Circom-2.1.6-orange?style=flat-square" />
</p>

SIGIL is an on-chain voting protocol with permanent vote privacy, quadratic voting, and anti-collusion (MACI Key Change). Built on [PSE MACI](https://maci.pse.dev) with Groth16 on-chain verification.

Individual votes are never revealed — not during voting, not after. Results are published as aggregates only, verified by zero-knowledge proofs on Ethereum.

## Packages

| Package | Description |
|---------|-------------|
| [`contracts/`](./contracts) | Solidity 0.8.24 — MACI, Poll, MessageProcessor, Tally, AccQueue, Groth16 verifiers |
| [`circuits/`](./circuits) | Circom — MessageProcessor, TallyVotes, DuplexSponge, SHA256Hasher |
| [`coordinator/`](./coordinator) | TypeScript — Auto-runner that processes votes and generates proofs |
| [`sdk/`](./sdk) | `@sigil/sdk` — Client library for integrating SIGIL into other apps |
| [`src/`](./src) | React 19 + Vite 7 + Wagmi 3 — Voting frontend with i18n (KO/EN) |

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Testing

```bash
# Smart contracts
forge test                  # 50 tests

# Crypto, circuits, property tests
npx vitest run              # 66 tests
```

116 tests total, 0 failures. Includes 20 MACI property tests covering 7 security attributes (collusion resistance, receipt-freeness, privacy, uncensorability, unforgeability, non-repudiation, correct execution).

## Architecture

```
User → encrypt (ECDH + DuplexSponge) → Poll.publishMessage()
                                              ↓
                                        AccQueue (on-chain)
                                              ↓
                              Coordinator auto-runner (off-chain)
                              - merge state & message trees
                              - process messages in reverse order
                              - generate Groth16 proofs (snarkjs)
                                              ↓
                              MessageProcessor.verify() → Tally.verify()
                                              ↓
                                   Results published on-chain
                                   (aggregates only, no individual votes)
```

Key Change: voters can change their MACI key and re-vote at any time. Only the last key's vote counts. The coercer cannot distinguish key-change messages from vote messages on-chain.

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| MACI | [`0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746`](https://sepolia.etherscan.io/address/0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746) |
| AccQueue | [`0x51C1835C96bfae2aff5D675Ef59b5BF23534396F`](https://sepolia.etherscan.io/address/0x51C1835C96bfae2aff5D675Ef59b5BF23534396F) |
| MsgProcessor Verifier | [`0x47221B605bF18E92296850191A0c899fe03A27dB`](https://sepolia.etherscan.io/address/0x47221B605bF18E92296850191A0c899fe03A27dB) |
| Tally Verifier | [`0xa48c2bD789EAd236fFEE36dEad220DFFE3feccF1`](https://sepolia.etherscan.io/address/0xa48c2bD789EAd236fFEE36dEad220DFFE3feccF1) |
| VkRegistry | [`0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C`](https://sepolia.etherscan.io/address/0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C) |
| VoiceCreditProxy | [`0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00`](https://sepolia.etherscan.io/address/0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00) |

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md)
- [MACI Protocol (PSE)](https://maci.pse.dev)
- [Tokamak Network](https://tokamak.network)

## License

[MIT](LICENSE)
