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

Individual votes are never revealed. Results are published as aggregates only, verified by zero-knowledge proofs on Ethereum.

## Repository Overview

- Purpose: private, bribe-resistant, quadratic voting for DAOs.
- Core stack: Solidity contracts, Circom circuits, coordinator auto-runner, SDK, and a Next.js frontend.
- Source of truth for networks and addresses: [`src/config.json`](./src/config.json).

## Search Keywords

private voting, quadratic voting, MACI, anti-collusion, zero-knowledge, Groth16, Ethereum governance, DAO voting, zk voting, privacy-preserving governance, Tokamak Network, SIGIL

## Packages

| Package | Description |
|---------|-------------|
| [`contracts/`](./contracts) | Solidity 0.8.24 — MACI, Poll, MessageProcessor, Tally, AccQueue, Groth16 verifiers |
| [`circuits/`](./circuits) | Circom — MessageProcessor, TallyVotes, DuplexSponge, SHA256Hasher |
| [`coordinator/`](./coordinator) | TypeScript — Auto-runner that processes votes and generates proofs |
| [`sdk/`](./sdk) | `@sigil/sdk` — Client library for integrating SIGIL into other apps |
| [`src/`](./src) | React 19 + Next 15 + Wagmi 3 — Voting frontend with i18n (KO/EN) |

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Testing

```bash
# Smart contracts
forge test

# Crypto, circuits, property tests
npx vitest run
```

E2E (Sepolia, requires funded keys + .env):
```bash
npm run test:e2e
```

Includes MACI property tests covering core security attributes (collusion resistance, receipt-freeness, privacy, uncensorability, unforgeability, non-repudiation, correct execution).

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

## Deployed Contracts (Sepolia, v2)

| Contract | Address |
|----------|---------|
| MACI | [`0x26428484F192D1dA677111A47615378Bc889d441`](https://sepolia.etherscan.io/address/0x26428484F192D1dA677111A47615378Bc889d441) |
| AccQueue | [`0x5321607ABc8171397Fac7c77FbB567847AF4d2ff`](https://sepolia.etherscan.io/address/0x5321607ABc8171397Fac7c77FbB567847AF4d2ff) |
| MsgProcessor Verifier | [`0x352522b121Ac377f39AaD59De6D5C07C43Af5D59`](https://sepolia.etherscan.io/address/0x352522b121Ac377f39AaD59De6D5C07C43Af5D59) |
| Tally Verifier | [`0xF1ecb18a649cf7060f746Cc155638992E83f1DD7`](https://sepolia.etherscan.io/address/0xF1ecb18a649cf7060f746Cc155638992E83f1DD7) |
| VkRegistry | [`0xCCcE4703D53fc112057C8fF4F1bC397C7F68732b`](https://sepolia.etherscan.io/address/0xCCcE4703D53fc112057C8fF4F1bC397C7F68732b) |
| Gatekeeper | [`0x4c18984A78910Dd1976d6DFd820f6d18e7edD672`](https://sepolia.etherscan.io/address/0x4c18984A78910Dd1976d6DFd820f6d18e7edD672) |
| VoiceCreditProxy | [`0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00`](https://sepolia.etherscan.io/address/0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00) |
| Token | [`0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`](https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044) |
| Delegation Registry | [`0x138EAa2FFd36E8634b0Eb4449028ac3fB79B367c`](https://sepolia.etherscan.io/address/0x138EAa2FFd36E8634b0Eb4449028ac3fB79B367c) |
| Timelock Executor | [`0x474EA4Cf563eADF9ee42a82c1Ee32E13019035c4`](https://sepolia.etherscan.io/address/0x474EA4Cf563eADF9ee42a82c1Ee32E13019035c4) |

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md)
- [MACI Protocol (PSE)](https://maci.pse.dev)
- [Tokamak Network](https://tokamak.network)

## License

[MIT](LICENSE)
