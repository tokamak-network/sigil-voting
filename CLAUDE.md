# SIGIL Project Rules

## 언어
- 한국어로 대화. 코드/커밋은 영어.

## 바이블 (스펙 문서) — 기술은 100% 바이블 기준
- 기술 구현은 무조건 아래 3개 문서 기준. 여기에 없으면 만들지 마, 여기에 있으면 바꾸지 마.
  1. `docs/specs/d1-private-voting.spec.md` — D1 비밀투표
  2. `docs/specs/d2-quadratic.spec.md` — D2 이차투표
  3. `docs/specs/maci-anti-collusion.spec.md` — MACI 담합방지

## 서비스 규칙
- 제안 생성: 설정된 토큰을 일정 수량 이상 보유한 사람만 가능. 아무나 못 함.
- 투표 흐름: 제안 생성 → 투표 → 또 제안 → 재투표 전부 OK. 시간 걸리면 로딩 길게 잡기.
- 투표 종료 → 집계: 코디네이터(GitHub Actions cron) 자동 처리. "계산중" 상태가 지속되면 cron 로그 확인.
- 카운트다운: 실제 남은 시간 + 5초 여유 줘서 UI가 100% 정확하게 맞도록.

## 코드 수정 규칙
- 코드 수정 후 관련 테스트 반드시 실행. 깨지면 고쳐서 전부 통과시킨 후 완료 보고.
- Solidity 수정 시 `forge fmt` 필수 (CI 실패 방지).
- 커밋은 사용자가 "커밋" 할 때만.

## 절대 하지 말 것
- D2 choice에 abstain(2) 넣지 마 (binary: 0 or 1)
- `% SNARK_SCALAR_FIELD` 쓰지 마 (SHA256은 `& ((1<<253)-1)`)
- Foundry library linking을 default 프로필에 넣지 마 (`[profile.deploy]`에만)
- Poseidon에 16개 넘는 input 넣지 마 (25개 tally → `quinaryTreeRoot()`)
