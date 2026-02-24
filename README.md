<p align="center">
  <h1 align="center">SIGIL</h1>
</p>

<p align="center">
  <a href="https://github.com/tokamak-network/sigil-voting/actions/workflows/test.yml"><img alt="CI" src="https://github.com/tokamak-network/sigil-voting/actions/workflows/test.yml/badge.svg" /></a>
  <a href="https://sigil-voting.vercel.app"><img alt="Live Demo" src="https://img.shields.io/badge/demo-sigil--voting.vercel.app-black?style=flat-square" /></a>
  <img alt="Solidity" src="https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat-square&logo=solidity" />
  <img alt="Circom" src="https://img.shields.io/badge/Circom-2.1.6-orange?style=flat-square" />
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" /></a>
</p>

On-chain private voting protocol built on [MACI](https://maci.pse.dev). Individual votes are encrypted and never revealed. Results are published as aggregates only, verified by Groth16 zero-knowledge proofs on Ethereum.

**Live on Sepolia testnet**: [sigil-voting.vercel.app](https://sigil-voting.vercel.app)

## What It Does

- Voters encrypt their vote with the coordinator's public key (ECDH + Poseidon DuplexSponge)
- Encrypted messages are stored on-chain in a Merkle tree
- A coordinator processes messages off-chain, generates ZK proofs, and submits results
- On-chain verifiers confirm proof validity before results are accepted
- Voters can change their MACI key and re-vote at any time; only the last key's vote counts

The coercer cannot distinguish key-change messages from vote messages on-chain. This breaks bribery markets.

## Stack

| Layer | Tech |
|-------|------|
| Contracts | Solidity 0.8.24 — MACI, Poll, MessageProcessor, Tally, AccQueue, Groth16 verifiers, DelegationRegistry, TimelockExecutor (22 contracts) |
| Circuits | Circom 2.1.6 — MessageProcessor, TallyVotes, DuplexSponge, SHA256Hasher |
| Coordinator | TypeScript — Auto-runner via GitHub Actions cron (every 5 min), generates Groth16 proofs with snarkjs, multi-key support, error retry with exponential backoff |
| Frontend | Next.js 15 + React 19 + Wagmi 3 + Tailwind — i18n (KO/EN), deployed on Vercel, real-time status polling, mobile responsive |
| SDK | `sigil-sdk` on npm — Client library + React widget (key management, encryption, command packing) |

## Architecture

```
User (browser)
  │
  ├─ Generate MACI keypair (BabyJubjub)
  ├─ Encrypt vote (ECDH shared secret → Poseidon DuplexSponge)
  └─ Submit encrypted message → Poll.publishMessage() on Sepolia
                                        │
                                  AccQueue (on-chain Merkle tree)
                                        │
                          Coordinator (GitHub Actions, every 5 min)
                          ├─ Merge state & message trees
                          ├─ Decrypt & process messages (last key wins)
                          ├─ Generate Groth16 proofs (snarkjs + .zkey)
                          └─ Submit proofs on-chain
                                        │
                          MessageProcessor.verify() → Tally.verify()
                                        │
                              Results published on-chain
                              (aggregates only, no individual votes)
```

## Deployed Contracts (Sepolia)

Two deployments exist: `v2` (dev, tree depth 2) and `prod` (tree depth 4, max 624 voters).

Frontend deployment is controlled by `NEXT_PUBLIC_CIRCUIT_MODE` env var (`dev` → v2, `prod` → prod). Default: `dev`. Contract addresses are in [`src/config.json`](./src/config.json).

| Contract | Address (v2) |
|----------|-------------|
| MACI | [`0x12DaA8f...6341B`](https://sepolia.etherscan.io/address/0x12DaA8f679e7C798645750F91106b38b38C6341B) |
| AccQueue | [`0xA0Af588...4622`](https://sepolia.etherscan.io/address/0xA0Af58848a15DFeC67486591f225464323D84622) |
| MsgProcessor Verifier | [`0x352522b...D59`](https://sepolia.etherscan.io/address/0x352522b121Ac377f39AaD59De6D5C07C43Af5D59) |
| Tally Verifier | [`0xF1ecb18...DD7`](https://sepolia.etherscan.io/address/0xF1ecb18a649cf7060f746Cc155638992E83f1DD7) |
| VkRegistry | [`0xCCcE470...2b`](https://sepolia.etherscan.io/address/0xCCcE4703D53fc112057C8fF4F1bC397C7F68732b) |
| Token | [`0xa30fe40...044`](https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044) |
| Delegation Registry | [`0x422921...33C3`](https://sepolia.etherscan.io/address/0x422921691C4978CC5b6ccbEF11a9A6F2878C33C3) |
| Timelock Executor | [`0x36e8AE...ca06`](https://sepolia.etherscan.io/address/0x36e8AE9241b8CD3eeE8a2b4Fc014eaCD7b8cca06) |

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000. Connect a wallet with Sepolia ETH.

## SDK

Install the standalone SDK for integrating SIGIL voting into any app:

```bash
npm install sigil-sdk
```

```typescript
import { SigilClient } from 'sigil-sdk';

const client = new SigilClient({ maciAddress, provider });
await client.signUp(signer);
await client.vote(pollId, choice, weight, signer);
```

React component:

```tsx
import { SigilVoteWidget } from 'sigil-sdk/react';

<SigilVoteWidget maciAddress="0x..." pollId={1} />
```

Full API reference: [`sdk/README.md`](./sdk/README.md)

## Testing

```bash
# Unit + component + security tests (320 tests)
npm test

# Smart contracts (requires Foundry)
forge test

# E2E on Sepolia (requires funded keys in .env)
npm run test:e2e
```

## Project Structure

```
contracts/     Solidity contracts (MACI, Poll, Tally, verifiers)
circuits/      Circom circuits (MessageProcessor, TallyVotes, DuplexSponge)
coordinator/   Auto-runner that processes votes and generates proofs
sdk/           Client library (key management, encryption, command packing)
src/           Next.js frontend (components, crypto, i18n, hooks)
test/          Vitest tests (components, circuits, crypto, security, e2e)
scripts/       Hardhat deploy scripts
```

## Security

7 HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-XSS-Protection) are set in `next.config.ts`.

Next.js middleware (`src/middleware.ts`) handles:
- Rate limiting (60 req/min per IP)
- CORS (same-origin only)
- CSRF (Origin header validation on POST/PUT/DELETE)
- Path blocking (`.env`, `.git`, `/api/internal` return 404)

Input validation with Zod schemas (`src/lib/validation.ts`) for vote inputs, poll creation, and Ethereum addresses.

Runtime secret exposure check (`src/lib/envCheck.ts`) blocks `PRIVATE_KEY` or `SECRET` from leaking into `NEXT_PUBLIC_*` env vars.

Error boundaries (`app/error.tsx`, `app/(app)/error.tsx`) hide stack traces in production.

Coordinator writes structured JSON audit logs for every poll processing action. Errors are classified as TRANSIENT or PERMANENT with automatic retry for transient failures.

48 security-specific tests cover all 15 OWASP-aligned categories. Run `npm test` to verify.

A code-level security audit was conducted — see [`docs/security-audit-report.md`](./docs/security-audit-report.md). Two HIGH-severity issues in TimelockExecutor were fixed (permissionless registration, unvalidated tally address).

**What this does NOT cover**: CSP allows `unsafe-eval` (required by snarkjs WASM). Rate limiting is in-memory per serverless instance (resets on cold start). Zod validation is client-side only. See Known Limitations.

## Governance Features

- **Proposal gating**: Only token holders above a threshold can create proposals
- **Vote delegation**: Delegate voting power to another address via DelegationRegistry
- **Timelock execution**: Proposals go through a timelock before on-chain execution
- **Delegation dashboard**: View current delegate, delegators list, and revoke delegation
- **Proposal search & filter**: Search by title, filter by status (Active/Ended/Tallied)

## Known Limitations

- Testnet only (Sepolia). Code-level audit completed (see Security). No external audit for mainnet use.
- Coordinator is a single trusted party. It cannot see individual votes but can halt processing.
- Circuit files (~130 MB) are downloaded at runtime from GitHub Releases, cached in GitHub Actions.
- `circomlibjs` dependency bundles ethers v5 internally, which has known low-severity vulnerabilities in its `elliptic` transitive dependency. This does not affect SIGIL's use of circomlibjs (Poseidon hashing only).

## References

- [MACI Protocol (PSE)](https://maci.pse.dev)
- [Tokamak Network](https://tokamak.network)

## License

MIT
