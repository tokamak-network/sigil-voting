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

## Goal

DAO, DeFi, NFT 커뮤니티 등 **Web3 프로젝트가 가져다 쓸 수 있는 비밀투표 인프라**를 만드는 것이 목표입니다.

- **D1 비밀투표**: 개별 투표 영구 비공개 (reveal 단계 없음)
- **D2 이차투표**: 고래 독점 방지 (비용 = 투표 수²)
- **MACI 담합방지**: Key Change로 매수/강요 무력화

이 세 가지를 모두 결합한 프로토콜은 SIGIL이 유일합니다. 최종 형태는 NPM 패키지 + Embed Widget + 독립 투표 페이지로 제공되는 SDK/Widget 플랫폼입니다.

## Development Activity

### Overview

| Metric | Value |
|--------|-------|
| Development Period | 2026-02-04 ~ present (16 days) |
| Total Commits | 225 |
| Commit Frequency | ~14 commits/day |
| Lines Added | +229,724 |
| Lines Deleted | -86,152 |
| Net Source Lines | 20,055 |
| Tests Passing | 116 (Forge 50 + Vitest 66, 0 failures) |

### Contributors

| Who | Commits | Role |
|-----|---------|------|
| monica-tokamak | 224 | Core development (contracts, circuits, frontend, coordinator) |
| SonYoungsung | 1 | Initial project setup |

### Codebase Breakdown

| Layer | Lines | What For |
|-------|------:|----------|
| Smart Contracts (Solidity) | 3,700 | MACI, Poll, MessageProcessor, Tally, AccQueue, Verifiers |
| ZK Circuits (Circom) | 1,381 | MessageProcessor, TallyVotes, DuplexSponge, SHA256 |
| Frontend (React TSX) | 5,673 | Voting UI, proposals list, results, landing page, i18n |
| Backend/Library (TypeScript) | 9,301 | Coordinator auto-runner, crypto utils, SDK, tests |

## Changelog

| Date | Type | Description |
|------|------|-------------|
| 2026-02-19 | fix | i18n 완성, UX 심층 검수 17건 수정, 보안 오딧 반영, AccQueue resetMerge 버그 수정 |
| 2026-02-18 | feat | E2E 테스트 3회 통과 (등록 → 투표 → 자동집계 → 온체인 Groth16 검증) |
| 2026-02-17 | feat | Technology 페이지, i18n 한/영 전환, 경쟁사 분석 기반 UX 개선, Sepolia V3 배포 |
| 2026-02-16 | feat | SDK 패키지 구조, Coordinator Auto-Runner, 토큰 게이트 제안 생성, 경쟁사 분석 |
| 2026-02-15 | feat | 랜딩페이지 마케팅 카피 (AIDA), 제안 목록, 투표 이력, 크레딧 추적, i18n |
| 2026-02-14 | feat | MACI 10-Phase 전체 완료 (회로 컴파일 + Trusted Setup + 프론트 EdDSA) |
| 2026-02-12 | feat | Real Groth16 Verifiers (MockVerifier 대체), D1/D2 투표 모드 통합 |
| 2026-02-10 | feat | In-Circuit DuplexSponge 복호화, MACI 7대 보안속성 Property Tests 20개 |
| 2026-02-07 | feat | Coordinator 완성 (8 모듈), 컨트랙트 보안 강화, EdDSA 서명 구현 |
| 2026-02-04 | init | 프로젝트 초기 설정, D1/D2 회로 및 컨트랙트 구현 |

## Deployed Contracts (Sepolia V8)

| Contract | Address |
|----------|---------|
| **MACI** | [`0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746`](https://sepolia.etherscan.io/address/0xAd4D82bF06d612CC5Ec3C6C9536c0AEc6A61f746) |
| AccQueue | [`0x51C1835C96bfae2aff5D675Ef59b5BF23534396F`](https://sepolia.etherscan.io/address/0x51C1835C96bfae2aff5D675Ef59b5BF23534396F) |
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
