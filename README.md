<p align="center">
  <h1 align="center">SIGIL</h1>
  <p align="center">Private Voting Infrastructure for DAOs</p>
  <p align="center">
    <a href="https://github.com/nickmura/zk-dex-d1-private-voting/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg" /></a>
    <img alt="Solidity" src="https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity" />
    <img alt="Circom" src="https://img.shields.io/badge/Circom-2.1.6-orange" />
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react" />
    <img alt="Tests" src="https://img.shields.io/badge/Tests-116%20passing-brightgreen" />
    <img alt="Network" src="https://img.shields.io/badge/Network-Sepolia-purple" />
  </p>
</p>

---

DAO votes are public. Whales dominate. Bribes go unchecked.

**SIGIL** is a ZK voting protocol that solves all three by combining permanent privacy, quadratic fairness, and anti-collusion into a single on-chain system. No other protocol offers this combination.

## Features

| | Feature | How |
|---|---------|-----|
| **Privacy** | Votes are permanently secret | Poseidon DuplexSponge encryption — no reveal phase, ever |
| **Anti-Bribery** | Coercion is pointless | MACI Key Change — voters can silently override forced votes |
| **Fairness** | Whales can't dominate | Quadratic voting — 10 votes cost 100 credits |
| **Verifiable** | Results are trustless | Groth16 proofs verified on Ethereum |

## Architecture

```
                         ┌──────────────┐
                         │   Frontend   │  React 19 · Wagmi · i18n
                         │              │  EdDSA key derivation
                         │  encrypt     │  DuplexSponge encryption
                         └──────┬───────┘
                                │ publishMessage()
                         ┌──────▼───────┐
                         │  Contracts   │  Solidity 0.8.24
                         │              │  MACI → Poll → AccQueue
                         │  on-chain    │  Groth16 verification
                         └──────┬───────┘
                                │ auto-trigger
                         ┌──────▼───────┐
                         │ Coordinator  │  TypeScript auto-runner
                         │              │  merge → process → prove
                         │  off-chain   │  reverse-order processing
                         └──────┬───────┘
                                │ snarkjs
                         ┌──────▼───────┐
                         │  ZK Circuits │  Circom · Groth16
                         │              │  MessageProcessor
                         │  prove       │  TallyVotes
                         └──────────────┘
```

## How It Works

```
1. Vote       Voter encrypts choice with coordinator's public key (ECDH + DuplexSponge)
2. On-chain   Encrypted message stored in Poll contract's AccQueue
3. Process    Coordinator decrypts all messages in reverse order (last message = highest priority)
4. Prove      Groth16 proof generated for each batch — any tampering breaks the proof
5. Tally      Only aggregate results published on-chain. Individual votes: never revealed.
```

**Anti-bribery:** If coerced, change your key and re-vote. The coercer sees two identical-looking messages on-chain and can never tell which is the real vote.

## Cryptography

| Primitive | Spec | Role |
|-----------|------|------|
| Poseidon DuplexSponge | t=4, rate=3 | Message encryption / decryption |
| Baby Jubjub EdDSA | BLAKE2b-512 key derivation | Command signing |
| ECDH | Ephemeral Diffie-Hellman | Shared key (voter ↔ coordinator) |
| Groth16 | snarkjs, Powers of Tau | On-chain proof verification |
| SHA256 | 253-bit field mapping | Public input compression |
| Poseidon Hash | Arity 2–6 | State leaf, ballot, tally commitment |

## Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| **MACI** | [`0xAd4D82bF...61f746`](https://sepolia.etherscan.io/address/0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746) |
| AccQueue | [`0x51C1835C...4396F`](https://sepolia.etherscan.io/address/0x51C1835C96bfae2aff5D675Ef59b5BF23534396F) |
| MessageProcessor Verifier | [`0x47221B60...A27dB`](https://sepolia.etherscan.io/address/0x47221B605bF18E92296850191A0c899fe03A27dB) |
| Tally Verifier | [`0xa48c2bD7...ccF1`](https://sepolia.etherscan.io/address/0xa48c2bD789EAd236fFEE36dEad220DFFE3feccF1) |
| VkRegistry | [`0xC8f6e6AB...852C`](https://sepolia.etherscan.io/address/0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C) |
| VoiceCreditProxy | [`0x03669FF2...F00`](https://sepolia.etherscan.io/address/0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00) |
| TON Token | [`0xa30fe402...044`](https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044) |

## Security Properties

SIGIL enforces all seven MACI security guarantees:

| Property | Guarantee |
|----------|-----------|
| Collusion Resistance | Key Change makes bribe verification impossible |
| Receipt-freeness | No receipt — voter cannot prove how they voted |
| Privacy | Individual votes never revealed, only aggregates |
| Uncensorability | Omitting a message causes the ZK proof to fail |
| Unforgeability | EdDSA signatures prevent vote fabrication |
| Non-repudiation | Signed votes are permanent, cannot be deleted |
| Correct Execution | Groth16 proofs guarantee honest computation |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Circuits | Circom 2.1.6, Groth16 (snarkjs 0.7.6) |
| Contracts | Solidity 0.8.24, Foundry, Hardhat |
| Frontend | React 19, Vite 7, Wagmi 3, TypeScript 5.9 |
| Crypto | circomlibjs, @noble/hashes, @semaphore-protocol |
| Network | Ethereum Sepolia |

## Quick Start

```bash
npm install
npm run dev
```

## Testing

```bash
forge test            # 50 contract tests
npx vitest run        # 66 crypto + circuit + property tests
```

116 tests, 0 failures. Includes 20 MACI property tests covering all 7 security attributes.

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md)
- [MACI Protocol — PSE](https://maci.pse.dev)
- [Tokamak Network](https://tokamak.network)

## License

[MIT](LICENSE)
