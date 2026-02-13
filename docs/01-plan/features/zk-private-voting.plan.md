# Plan: ZK Private Voting System

> **Feature**: zk-private-voting
> **Phase**: Plan
> **Created**: 2026-02-11
> **Status**: IN PROGRESS (스펙 미완료 항목 존재)

---

## 0. 최우선 제약조건 (MUST)

### 0.1 D1/D2 스펙 준수 (절대)
- **D1 스펙**: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md
- **D2 스펙**: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md
- **스펙에서 벗어나면 안됨**

#### D1 Private Voting 스펙
```
목적: Commit-reveal voting with hidden choices
      - Anti-Coercion (투표 매수/강압 방지)
      - 비밀 투표 (reveal 전까지 선택 숨김)

Public Inputs (4):
  - voteCommitment: 투표 선택 + salt 해시
  - proposalId: 제안 ID
  - votingPower: 투표권 (공개)
  - merkleRoot: 유권자 스냅샷 머클 루트

Private Inputs:
  - pkX, pkY, sk: 키페어
  - noteHash, noteValue, noteSalt: 토큰 노트
  - choice: 0=against, 1=for, 2=abstain
  - voteSalt: 투표 랜덤값
  - merklePath[20], merkleIndex: 머클 증명

Commitment: Poseidon(choice, votingPower, proposalId, voteSalt)
Nullifier: hash(sk, proposalId) - 제안당 1회 투표
```

#### D2 Quadratic Voting 스펙
```
목적: 비용 = 투표수² (고래 영향력 제한)
      - Preference Intensity (선호 강도 표현)
      - Anti-Plutocracy (금권정치 방지)

Public Inputs (4):
  - voteCommitment: 선택 + 투표수 + 비용 해시
  - proposalId: 제안 ID
  - creditsSpent: 소비된 크레딧 (공개, numVotes²)
  - creditRoot: 크레딧 할당 머클 루트

Private Inputs:
  - pkX, pkY, sk: 키페어
  - totalCredits: 보유 크레딧
  - numVotes: 투표 수 (cost = numVotes²)
  - choice: 0=against, 1=for (binary)
  - voteSalt: 투표 랜덤값
  - creditNoteHash, creditSalt: 크레딧 노트
  - merklePath[20], merkleIndex: 머클 증명

Quadratic Cost: creditsSpent === numVotes * numVotes
Commitment: Poseidon(choice, numVotes, creditsSpent, proposalId, voteSalt)
```

#### 현재 구현 (ZkVotingFinal.sol)
```
D1+D2 통합: Quadratic 비용 + Commit-Reveal + ZK Privacy

Commit Phase:
  - castVoteD2() 또는 onApprove()
  - ZK 증명 검증
  - TON 토큰 차감 (numVotes² TON)
  - commitment 저장

Reveal Phase:
  - revealVoteD2(proposalId, nullifier, choice, numVotes, voteSalt)
  - commitment 재계산하여 검증
  - forVotes/againstVotes 집계

Phase:
  - 0: Commit (now <= endTime)
  - 1: Reveal (endTime < now <= revealEndTime)
  - 2: Ended (now > revealEndTime)
```

### 0.2 컨트랙트 함수 시그니처 (변경 불가)
```solidity
// Sepolia: 0xFef153ADfC04790906a8dF8573545E9b7589fa58

// Commit (투표)
function castVoteD2(
    uint256 _proposalId,
    uint256 _commitment,
    uint256 _numVotes,
    uint256 _creditsSpent,
    uint256 _nullifier,
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC
)

// Reveal (공개) - 구현 필요
function revealVoteD2(
    uint256 _proposalId,
    uint256 _nullifier,
    uint256 _choice,
    uint256 _numVotes,
    uint256 _voteSalt
)

// Phase 조회
function getPhaseD2(uint256 _proposalId) returns (uint8)
// 0: Commit, 1: Reveal, 2: Ended
```

### 0.3 트랜잭션 안정성 (필수)
| 검증 항목 | 테스트 방법 |
|----------|------------|
| 제안 생성 | Sepolia에서 실제 TX 성공 |
| 투표 (Commit) | Sepolia에서 실제 TX 성공 |
| 공개 (Reveal) | Sepolia에서 실제 TX 성공 |
| ZK 증명 | 컨트랙트 verifyProof 통과 |

### 0.4 배포 환경
- **Network**: Sepolia Testnet (Chain ID: 11155111)
- **Contract**: `0xFef153ADfC04790906a8dF8573545E9b7589fa58`
- **TON Token**: `0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`

---

## 1. Overview

TON 토큰 기반 ZK 프라이버시 투표 시스템. D1(Private Voting)과 D2(Quadratic Voting)를 **통합**한 단일 시스템.

### 1.1 핵심 컨셉
- **Quadratic Voting**: 돈 많으면 더 투표 가능, 적으면 1표만 (비용 = 투표수²)
- **ZK Privacy**: 투표 내용 암호화, Reveal 전까지 비공개
- **Commit-Reveal**: 2단계 투표로 조작 방지

### 1.2 투표 흐름 (스펙)
```
[Commit Phase] → [Reveal Phase] → [Ended]
  투표 제출         투표 공개        결과 집계
  (ZK 증명)       (choice+salt)    (forVotes/againstVotes)
```

---

## 2. 스펙 준수 현황

### 2.1 컨트랙트 스펙 (ZkVotingFinal.sol)

| 기능 | 함수 | 프론트엔드 | 상태 |
|------|------|:----------:|:----:|
| 제안 생성 | `createProposalD2()` | ✅ | 완료 |
| 투표 (Commit) | `castVoteD2()` / `onApprove()` | ✅ | 완료 |
| **투표 공개 (Reveal)** | `revealVoteD2()` | ❌ | **미구현** |
| **Phase 조회** | `getPhaseD2()` | ❌ | **미구현** |
| **결과 조회** | `getProposalD2()` → forVotes/againstVotes | ❌ | **미구현** |

### 2.2 Phase 정의 (컨트랙트)

| Phase | 값 | 조건 | 허용 액션 |
|-------|:--:|------|----------|
| Commit | 0 | `now <= endTime` | 투표 제출 |
| Reveal | 1 | `endTime < now <= revealEndTime` | 투표 공개 |
| Ended | 2 | `now > revealEndTime` | 결과 조회만 |

---

## 3. 구현 완료 기능

### 3.1 Commit Phase (투표 제출) ✅
- 지갑 연결
- 제안 생성 (100 TON 이상 필요)
- 투표 방향 선택 (찬성/반대)
- 투표 강도 슬라이더 (1 ~ maxVotes)
- ZK 증명 생성 (Web Worker)
- 단일 트랜잭션 투표 (approveAndCall)
- 투표 데이터 localStorage 저장

### 3.2 UX 규칙 ✅
- TON Symbol SVG 사용
- Pre-flight 확인 모달
- 원샷 경고 (제안당 1회)
- 로딩 오버레이
- 가스 버퍼 설정

---

## 4. 미구현 기능 (스펙 필수)

### 4.1 Phase 상태 표시
**현재**: 남은 시간만 표시 ("2일 3시간")
**필요**: Phase 구분 + 시각화

```
[Commit ●━━━] → [Reveal ○───] → [종료]
 투표 중          대기 중
```

**구현 항목**:
- `getPhaseD2()` 호출
- Phase별 UI 분기
- Phase 진행 바

### 4.2 Reveal Phase UI
**현재**: 없음
**필요**: 투표 공개 UI

```
┌──────────────────────────────────────────────┐
│  📢 공개 기간                                 │
│  남은 시간: 23시간 45분                        │
│                                              │
│  내 투표: 5표 (암호화됨)                       │
│                                              │
│  [투표 공개하기]                              │
│                                              │
│  ⚠️ 공개하지 않으면 집계에서 제외됩니다        │
└──────────────────────────────────────────────┘
```

**구현 항목**:
- localStorage에서 저장된 투표 로드
- `revealVoteD2()` 호출
- 공개 완료 상태 표시

### 4.3 결과 UI (Ended Phase)
**현재**: "투표 종료" 텍스트만
**필요**: 실제 결과 표시

```
┌──────────────────────────────────────────────┐
│  📊 투표 종료                                 │
│                                              │
│  찬성  ████████████░░░░  75표                │
│  반대  ████░░░░░░░░░░░░  30표                │
│                                              │
│  참여: 45명 | 공개: 42명                      │
└──────────────────────────────────────────────┘
```

**구현 항목**:
- `getProposalD2()` → forVotes, againstVotes
- 비율 바 시각화
- 참여자/공개자 수 표시

---

## 5. UI 원칙

### 5.1 비용 표시 제거
- ~~제안 목록: 사용 TON~~ → 투표 수만 표시
- ~~Reveal UI: 비용~~ → 투표 수만 표시
- ~~결과 UI: 총 TON~~ → 투표 수만 표시

**이유**: 투표 시 이미 비용 확인함. 이후 단계에서 불필요.

### 5.2 Phase별 UI 상태

| Phase | 투표 버튼 | 공개 버튼 | 결과 표시 |
|-------|:--------:|:--------:|:--------:|
| Commit | ✅ 활성 | 숨김 | 숨김 |
| Reveal | 비활성 | ✅ 활성 | 숨김 |
| Ended | 비활성 | 비활성 | ✅ 표시 |

---

## 6. 기술 스펙

### 6.1 Reveal 트랜잭션 (스펙 준수)
```typescript
// 저장된 투표 데이터 로드 (Commit 시 localStorage에 저장됨)
const voteData = getD2VoteForReveal(proposalId, address)
// { choice, numVotes, creditsSpent, voteSalt, nullifier, commitment }

// 컨트랙트 호출 - 시그니처 정확히 맞춰야 함
await writeContract({
  address: ZK_VOTING_FINAL_ADDRESS,
  abi: ZK_VOTING_FINAL_ABI,
  functionName: 'revealVoteD2',
  args: [
    proposalId,           // uint256
    voteData.nullifier,   // uint256
    voteData.choice,      // uint256 (0=against, 1=for)
    voteData.numVotes,    // uint256
    voteData.voteSalt     // uint256
  ]
})

// 컨트랙트 내부 검증 로직:
// inner = Poseidon(choice, numVotes, creditsSpent, proposalId)
// computedCommitment = Poseidon(inner, voteSalt, 0, 0)
// require(computedCommitment === storedCommitment)
```

**중요**: Reveal 시 creditsSpent는 args에 없음. 컨트랙트가 저장된 값 사용.

### 6.2 Phase 조회
```typescript
const phase = await readContract({
  functionName: 'getPhaseD2',
  args: [proposalId]
})
// 0: Commit, 1: Reveal, 2: Ended
```

### 6.3 결과 조회
```typescript
const proposal = await readContract({
  functionName: 'getProposalD2',
  args: [proposalId]
})
// proposal.forVotes, proposal.againstVotes
// proposal.totalCommitments, proposal.revealedVotes
```

---

## 7. 핵심 제약 조건

### 7.1 트랜잭션 안정성 (필수)
**기존 트랜잭션 로직 절대 변경 금지**

| 기능 | 파일 | 보호 대상 |
|------|------|----------|
| 제안 생성 | QuadraticVotingDemo.tsx | `handleCreateProposal()` |
| 투표 (Commit) | QuadraticVotingDemo.tsx | `handleVote()` |
| ZK 증명 | zkproof.ts | `generateQuadraticProof()` |
| approveAndCall | QuadraticVotingDemo.tsx | TON 트랜잭션 로직 |

**원칙**:
- 새 기능은 **별도 함수**로 추가
- 기존 함수 수정 시 **기능 동일성** 보장
- 트랜잭션 파라미터 변경 금지

### 7.2 코드 유지보수성

**현재 문제**: `QuadraticVotingDemo.tsx`가 900줄+ (너무 큼)

**리팩토링 계획**:
```
src/components/
├── QuadraticVotingDemo.tsx    # 메인 (축소)
├── voting/
│   ├── ProposalList.tsx       # 제안 목록
│   ├── ProposalCard.tsx       # 제안 카드
│   ├── VoteForm.tsx           # 투표 폼 (Commit)
│   ├── RevealForm.tsx         # 공개 폼 (Reveal) [NEW]
│   ├── VoteResult.tsx         # 결과 표시 [NEW]
│   └── PhaseIndicator.tsx     # Phase 표시 [NEW]
├── shared/
│   ├── TonIcon.tsx            # TON 아이콘
│   └── LoadingOverlay.tsx     # 로딩 오버레이
```

**리팩토링 원칙**:
1. 기존 로직 그대로 컴포넌트로 분리
2. Props로 상태/함수 전달
3. 한 번에 하나씩 분리 (점진적)
4. 분리 후 동작 테스트

---

## 8. 구현 순서

| 순서 | 작업 | 스펙 필수 | 리팩토링 |
|:----:|------|:--------:|:--------:|
| 1 | Phase 상태 조회 추가 | ✅ | - |
| 2 | PhaseIndicator 컴포넌트 분리 | - | ✅ |
| 3 | Reveal Phase UI 추가 | ✅ | - |
| 4 | RevealForm 컴포넌트 분리 | - | ✅ |
| 5 | 결과 UI 추가 | ✅ | - |
| 6 | VoteResult 컴포넌트 분리 | - | ✅ |
| 7 | VoteForm 분리 (기존 투표 UI) | - | ✅ |

**각 단계 후 검증**:
- [ ] 제안 생성 트랜잭션 성공
- [ ] 투표 트랜잭션 성공
- [ ] UI 정상 동작

---

## 9. 파일 변경 예상

| 파일 | 변경 내용 | 위험도 |
|------|----------|:------:|
| `QuadraticVotingDemo.tsx` | Phase 분기, 컴포넌트 import | 중 |
| `voting/PhaseIndicator.tsx` | 신규 생성 | 낮음 |
| `voting/RevealForm.tsx` | 신규 생성 | 낮음 |
| `voting/VoteResult.tsx` | 신규 생성 | 낮음 |
| `App.css` | Reveal/결과 스타일 추가 | 낮음 |
| `zkproof.ts` | 변경 없음 | - |

---

## 10. 성공 기준

### 10.1 기능 기준
| 항목 | 기준 |
|------|------|
| Phase 표시 | 3가지 상태 정확히 구분 |
| Reveal 기능 | 저장된 투표 공개 성공 |
| 결과 표시 | forVotes/againstVotes 정확히 표시 |
| 비용 미표시 | 제안목록/Reveal/결과에서 TON 비용 숨김 |

### 10.2 안정성 기준
| 항목 | 기준 |
|------|------|
| 제안 생성 | 트랜잭션 성공 (변경 전과 동일) |
| 투표 (Commit) | 트랜잭션 성공 (변경 전과 동일) |
| ZK 증명 | 생성 시간 동일 |

### 10.3 코드 품질 기준
| 항목 | 기준 |
|------|------|
| 컴포넌트 크기 | 각 파일 300줄 이하 |
| 단일 책임 | 컴포넌트당 1가지 역할 |
| 재사용성 | Phase별 UI 분리 |

---

## 11. 배포 전 체크리스트 (Sepolia)

### 11.1 트랜잭션 테스트
```
[ ] 1. 제안 생성 (createProposalD2)
    - TX 성공
    - proposalId 반환 확인
    - 이벤트 ProposalCreatedD2 발생

[ ] 2. 투표 - Commit (approveAndCall → castVoteD2)
    - TX 성공
    - TON 차감 확인 (numVotes² TON)
    - nullifier 저장 확인
    - 이벤트 VoteCommittedD2 발생

[ ] 3. 투표 공개 - Reveal (revealVoteD2)
    - TX 성공
    - forVotes/againstVotes 증가 확인
    - 이벤트 VoteRevealedD2 발생

[ ] 4. Phase 전환
    - Commit → Reveal 전환 확인
    - Reveal → Ended 전환 확인
```

### 11.2 에러 케이스 테스트
```
[ ] NullifierAlreadyUsed: 중복 투표 시 revert
[ ] NotInCommitPhase: Reveal 기간에 투표 시 revert
[ ] NotInRevealPhase: Commit 기간에 공개 시 revert
[ ] InvalidProof: 잘못된 ZK 증명 시 revert
[ ] InvalidReveal: 잘못된 choice/salt 시 revert
```

### 11.3 UI 테스트
```
[ ] Phase 표시 정확
[ ] Commit UI: 투표 성공 후 상태 변경
[ ] Reveal UI: 저장된 투표 데이터 로드
[ ] Reveal UI: 공개 성공 후 상태 변경
[ ] Result UI: forVotes/againstVotes 표시
```

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-11 | AI | 초기 Plan |
| 2026-02-11 | AI | D1+D2 통합 개념 반영, 비용 표시 제거, 스펙 필수 항목 정리 |
| 2026-02-11 | AI | 트랜잭션 안정성 제약, 코드 리팩토링 계획 추가 |
| 2026-02-11 | AI | D1/D2 스펙 필수 준수, 컨트랙트 시그니처, 배포 체크리스트 추가 |
| 2026-02-11 | AI | D1/D2 원문 스펙 상세 추가, Reveal 검증 로직 명시 |
