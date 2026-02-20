---
name: verify
description: 전체 검증 — 테스트, 보안, 최적화, UX, 콘텐츠, 확장 가능성까지 모두 검사합니다.
---

# 전체 검증 (All-in-One)

## Part 1: 테스트 & 빌드
1. `forge fmt --check` (실패 시 `forge fmt` 후 재확인)
2. `forge test --summary`
3. `npx vitest run`
4. `cd sdk && npx vitest run`
5. `npx tsc --noEmit`

## Part 2: 버그 & 에러
- 코드 전체에서 미사용 import, dead code, any 타입 검출
- console.log/console.error 프로덕션 노출 여부
- 에러 핸들링 누락 (try/catch 없는 async, unhandled promise)
- 컴포넌트 간 props 불일치, 타입 충돌

## Part 3: 보안 오딧
- XSS: dangerouslySetInnerHTML, innerHTML 사용처
- 키 노출: private key, salt가 console/localStorage에 노출되는지
- 외부 링크: rel="noopener noreferrer" 누락
- 입력 검증: 사용자 입력이 검증 없이 컨트랙트에 전달되는지
- SNARK 필드 범위: salt, commitment 값이 SNARK field 내인지

## Part 4: 가스 & 성능 최적화
- 컨트랙트: 불필요한 storage read, 반복 호출, 가스 낭비 패턴
- 프론트엔드: 불필요한 리렌더, 무거운 useEffect, 번들 크기
- RPC 호출: 중복 호출, 배치 가능한 호출, 캐싱 가능한 데이터

## Part 5: 랜딩페이지 & 기술페이지 콘텐츠
`src/components/LandingPage.tsx`, `src/components/TechnologyPage.tsx`, `src/i18n/ko.ts`, `src/i18n/en.ts` 읽고:
- **팩트체크**: 모든 수치, 기술 설명, 경쟁사 비교가 사실인지 바이블 3개 + 실제 코드 기준으로 검증
- 변경사항이 정확히 반영됐는지 (기능, 수치, 상태)
- 아직 반영 안 된 장점이 있는지 (경쟁사 대비, 기술적 차별점)
- 테스트넷 한계 + "커스텀하면 이런 것도 가능" 메시지가 있는지
- 불필요한 정보, 중복 설명, 과장 표현 제거
- 부족한 설명 보충

## Part 6: UX/UI 검토
- 비개발자가 이해할 수 있는 문구인지 (기술 용어 노출 여부)
- 사용 흐름이 직관적인지 (제안 생성 → 투표 → 결과 확인)
- 에러/로딩/빈 상태 안내가 충분한지
- 모바일 반응형 깨지는 곳 없는지
- CTA 버튼, 안내 문구가 행동을 유도하는지
- i18n ko/en 키 누락, 빈 문자열 검출

## Part 7: 확장 & 개선 제안
현재 구현 기준으로 더 확장하거나 개선할 수 있는 방향 탐색:
- 아직 활용 안 한 기술적 가능성 (컨트랙트, 회로, SDK에 이미 있는데 프론트에 안 나온 것)
- 경쟁사가 못 하는데 SIGIL은 할 수 있는 것 중 아직 강조 안 된 것
- SDK/Widget 활용 시나리오 확장 (다른 DAO, DeFi, NFT 커뮤니티 적용)
- UX 흐름 단축, 불필요한 단계 제거, 자동화 가능한 부분
- 가스비 절감, 배치 처리, 멀티체인 등 인프라 개선

## 보고 형식
```
=== 테스트 ===
forge fmt:    ✅/❌
forge test:   ✅ N passed / ❌ N failed
vitest:       ✅ N passed / ❌ N failed
sdk test:     ✅ N passed / ❌ N failed
tsc:          ✅/❌

=== 발견 사항 ===
🔴 치명적: (있으면 나열)
🟡 개선 권장: (있으면 나열)
🟢 양호: (특이사항 없으면 "전체 양호")

=== 콘텐츠 & UX ===
📝 팩트체크 오류: (있으면 나열)
📝 반영 필요: (있으면 나열)
✅ 양호: (특이사항 없으면 "전체 양호")

=== 확장 & 개선 ===
💡 제안: (발견한 개선점 나열, 우선순위 높은 순)
```

발견 사항이 있으면 수정안까지 제시. 전부 통과면 "전체 통과" 한 줄.
