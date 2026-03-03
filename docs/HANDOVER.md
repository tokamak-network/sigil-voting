# SIGIL 프로젝트 인수인계서

**작성일:** 2026-03-03
**저장소:** https://github.com/tokamak-network/sigil-voting
**라이브:** https://sigil-voting.vercel.app (Sepolia 테스트넷)

---

## 프로젝트 개요

SIGIL은 ZK 기반 거버넌스 투표 프로토콜. D1(비밀투표) + D2(이차투표) + MACI(담합방지)를 하나의 서비스로 통합.

사용자에게는 찬성/반대 + 투표 강도만 보임. D1/D2/MACI 같은 용어는 노출하지 않음.

기술 구현은 `docs/specs/` 아래 3개 스펙 문서가 절대 기준. 프로젝트 규칙은 `CLAUDE.md` 참고.

---

## 구조

- `contracts/` — Solidity 컨트랙트 (MACI, Poll, Tally, AccQueue 등)
- `circuits/` — Circom ZK 서킷 + 빌드 아티팩트
- `coordinator/` — 오프체인 집계 처리 (GitHub Actions cron 5분마다)
- `sdk/` — @sigil/sdk NPM 패키지
- `src/`, `app/` — Next.js 15 프론트엔드
- `test/`, `e2e/` — Vitest + Playwright 테스트

---

## 투표 흐름

1. 사용자가 투표 → 클라이언트에서 EdDSA/ECDH/DuplexSponge로 암호화 → `Poll.publishMessage()`로 온체인 제출
2. 투표 종료 → 코디네이터가 메시지 복호화 → **역순 처리** → Groth16 증명 생성 → 온체인 검증
3. 집계 결과(찬성/반대 총합)만 공개. 개별 투표는 영구 비공개.

**역순 처리가 MACI 핵심.** 키변경으로 이전 투표를 무효화하는 담합방지 메커니즘.

---

## 환경 변수

`.env.example` 참고. 핵심:

```bash
PRIVATE_KEY=0x...                    # 배포 지갑
COORDINATOR_PRIVATE_KEY=0x...        # 투표 복호화용 (Baby Jubjub)
SEPOLIA_RPC_URL=https://...
NEXT_PUBLIC_CIRCUIT_MODE=dev         # 'dev' 또는 'prod'
NEXT_PUBLIC_PRIVY_APP_ID=...         # Privy 월렛
RELAYER_PRIVATE_KEY=0x...            # 가스리스 릴레이어
```

GitHub Actions Secrets: `PRIVATE_KEY`, `COORDINATOR_PRIVATE_KEY_V2`, `COORDINATOR_PRIVATE_KEY_PROD`, `SEPOLIA_RPC_URL`

**코디네이터 키 분실 = 해당 배포의 모든 폴 영구 집계 불가.**

---

## 배포

- 컨트랙트 주소: `src/config.json` (V2 개발용 / Prod 프로덕션용 두 세트)
- 네트워크: Sepolia (Chain ID 11155111)
- CI: `.github/workflows/test.yml` — PR/push 시 Forge + Vitest + 빌드
- 코디네이터: `.github/workflows/coordinator.yml` — 5분 cron, 수동 트리거 가능
- 프론트: Vercel — main push 시 자동 배포
- 서킷 파일: GitHub Releases `circuits-v1` 태그

---

## 보안

상세: `docs/security-audit-report.md`

- High 2건 수정 완료 (TimelockExecutor 접근제어)
- Medium 4건 미수정:
  - FreeForAllGatekeeper Sybil 무제한 → 메인넷 전 토큰 게이트키퍼로 교체
  - 위임자 많으면 가스 초과 → 100명 제한 권장
  - publishMessage 스팸 방지 없음
  - KeyStore가 지갑 주소만으로 암호화 → 메인넷 전 강화 필요
- 전문 보안 감사 미완료. 메인넷 전 필수.

---

## 운영

- 투표 집계는 GitHub Actions cron이 자동 처리. 별도 조치 없음.
- "계산중" 지속되면 Actions 로그 확인. 수동 트리거로 재실행 가능.
- 로컬 개발: `npm ci --legacy-peer-deps` → `npm run dev`
- 새 배포: `npm run deploy` → `src/config.json` 주소 반영 → GitHub Secrets 키 설정

---

*스펙: `docs/specs/`, 규칙: `CLAUDE.md`*
