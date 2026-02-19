<p align="center">
  <h1 align="center">SIGIL</h1>
  <p align="center"><strong>Private Voting Infrastructure for DAOs</strong></p>
  <p align="center">
    <a href="https://sepolia.etherscan.io/address/0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746"><img alt="Sepolia" src="https://img.shields.io/badge/Live_on-Sepolia-purple" /></a>
    <img alt="Tests" src="https://img.shields.io/badge/Tests-116_passing-brightgreen" />
    <img alt="E2E" src="https://img.shields.io/badge/E2E-Groth16_verified-blue" />
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" /></a>
  </p>
</p>

---

## The Problem

Most DAO voting is broken in three ways:

- **Public ballots** — Everyone sees how you voted. This enables social pressure, retaliation, and strategic voting.
- **Whale dominance** — One large holder can outvote thousands of small holders.
- **Bribery markets** — When votes are public and provable, buying votes becomes trivial.

Existing tools fix one of these at best. Snapshot reveals votes after voting ends. MACI alone doesn't have quadratic voting. Quadratic voting alone doesn't stop bribes.

## The Solution

SIGIL combines three primitives into one protocol — the only system that solves all three simultaneously:

| Problem | SIGIL's Answer | Mechanism |
|---------|---------------|-----------|
| Public votes | **Permanent privacy** | Votes are encrypted and never revealed — not even after voting ends |
| Whale dominance | **Quadratic voting** | Casting 10 votes costs 100 credits. Influence grows as square root of budget |
| Bribery | **Key Change defense** | Voters can silently override coerced votes. Bribers can never verify compliance |

All results are verified on Ethereum with Groth16 zero-knowledge proofs. No trust required.

## How It Works

**For voters**, it's three clicks:

1. Connect wallet & register (one-time)
2. Pick For or Against, choose vote weight
3. Submit — your vote is encrypted in your browser and sent on-chain

**Under the hood:**

```
  Voter's browser                    Ethereum                    Coordinator
  ─────────────                      ────────                    ───────────
  Encrypt vote (ECDH + Poseidon)
  Sign command (EdDSA)
            ─── publishMessage() ──►  Stored on-chain
                                      (encrypted, unreadable)
                                                          ◄───  Detect poll ended
                                                                Decrypt all messages
                                                                Process in reverse order*
                                                                Generate ZK proofs
                                      Verify Groth16 proof ◄──  Submit proof + tally
                                      Publish: FOR=X, AGAINST=Y
                                      (individual votes: NEVER)
```

*\*Reverse order means the last message wins. If you changed your key and re-voted, only the new vote counts — but nobody can tell which message is which.*

## Comparison

| | SIGIL | Snapshot + Shutter | Aragon + MACI | Tally |
|---|:---:|:---:|:---:|:---:|
| **Permanent privacy** | Yes | No — revealed after voting | Yes | No |
| **Anti-bribery** | Yes — Key Change | No | Yes | No |
| **Quadratic voting** | Built-in | Plugin | No | No |
| **On-chain verification** | Groth16 | Off-chain | Groth16 | On-chain |
| **Automated tallying** | Yes | Yes | No — demo stage | Yes |

## Integration

```typescript
import { SigilClient } from '@sigil/sdk';

const sigil = new SigilClient({
  maciAddress: '0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746',
  provider,   // ethers.js provider
  signer,     // ethers.js signer
});

// List proposals
const polls = await sigil.getPolls();

// Cast a vote (auto-registers, encrypts, submits)
await sigil.vote(0, 'for', 3);   // 3 votes = 9 credits

// Get verified results
const results = await sigil.getResults(0);
// → { forVotes: 42n, againstVotes: 17n, isFinalized: true }
```

> SDK is in active development. The web app is fully functional on Sepolia today.

## Trust & Verification

| What | How |
|------|-----|
| Built on [PSE MACI](https://maci.pse.dev) | Ethereum Foundation's Privacy & Scaling Explorations research |
| Groth16 proofs | Every tally verified on-chain — any tampering breaks the proof |
| 7 security properties | Collusion resistance, receipt-freeness, privacy, uncensorability, unforgeability, non-repudiation, correct execution |
| 116 tests passing | 50 contract tests (Foundry) + 66 crypto/circuit/property tests (Vitest) |
| E2E verified | Full flow tested on Sepolia: register → vote → auto-tally → on-chain proof verification |
| Open source | MIT license. Full source code available |

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| **MACI** | [`0xAd4D82bF...61f746`](https://sepolia.etherscan.io/address/0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746) |
| MessageProcessor Verifier | [`0x47221B60...A27dB`](https://sepolia.etherscan.io/address/0x47221B605bF18E92296850191A0c899fe03A27dB) |
| Tally Verifier | [`0xa48c2bD7...ccF1`](https://sepolia.etherscan.io/address/0xa48c2bD789EAd236fFEE36dEad220DFFE3feccF1) |
| VoiceCreditProxy (ERC20) | [`0x03669FF2...F00`](https://sepolia.etherscan.io/address/0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00) |

<details>
<summary>All contracts</summary>

| Contract | Address |
|----------|---------|
| AccQueue | [`0x51C1835C...4396F`](https://sepolia.etherscan.io/address/0x51C1835C96bfae2aff5D675Ef59b5BF23534396F) |
| VkRegistry | [`0xC8f6e6AB...852C`](https://sepolia.etherscan.io/address/0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C) |
| Gatekeeper | [`0x4c18984A...D672`](https://sepolia.etherscan.io/address/0x4c18984A78910Dd1976d6DFd820f6d18e7edD672) |
| TON Token | [`0xa30fe402...044`](https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044) |

</details>

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Circuits | Circom 2.1.6 · Groth16 · snarkjs |
| Contracts | Solidity 0.8.24 · Foundry · Hardhat |
| Frontend | React 19 · Vite 7 · Wagmi 3 · TypeScript |
| Crypto | Poseidon · Baby Jubjub EdDSA · DuplexSponge · ECDH |
| Network | Ethereum (Sepolia testnet) |

## Quick Start

```bash
npm install
npm run dev        # → http://localhost:5173
```

## References

- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md) — Permanent vote privacy
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md) — Anti-whale mechanism
- [MACI Protocol (PSE)](https://maci.pse.dev) — Anti-collusion infrastructure
- [Tokamak Network](https://tokamak.network) — Project maintainer

## License

[MIT](LICENSE)
