# Test Scenarios - D1 Private Voting

## 발견된 버그

### 🔴 Critical Bug #1: Fake Proof Generation
**파일**: `src/zkproof.ts:420-428`
**문제**: `generateVoteProof()`가 실제 snarkjs 대신 **랜덤 값으로 가짜 proof 생성**
```typescript
// 현재 코드 - 가짜 proof!
const proof: ZKProof = {
  pA: [randomFieldElement(), randomFieldElement()],  // ❌ 랜덤
  pB: [[randomFieldElement(), randomFieldElement()], ...],
  pC: [randomFieldElement(), randomFieldElement()]
}
```
**결과**: 온체인 verifier가 항상 reject → 투표 불가

### 🔴 Critical Bug #2: Fake Poseidon Hash
**파일**: `src/zkproof.ts:89-99`
**문제**: 실제 Poseidon 대신 단순 해시 사용
```typescript
// 현재 코드 - 가짜 해시!
function poseidonHash(inputs: bigint[]): bigint {
  let hash = 0n
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 31n + BigInt(data.charCodeAt(i))) % (2n ** 254n)
  }
  return hash
}
```
**결과**:
- noteHash 불일치
- commitment 불일치
- nullifier 불일치
- Merkle root 불일치

### 🔴 Critical Bug #3: Fake Key Derivation
**파일**: `src/zkproof.ts:145-150`
**문제**: Baby Jubjub 대신 단순 해시로 공개키 유도
```typescript
// 현재 코드 - 가짜 키 유도!
function derivePublicKey(sk: bigint): { pkX: bigint; pkY: bigint } {
  const pkX = poseidonHash([sk, 1n])  // ❌ Baby Jubjub 아님
  const pkY = poseidonHash([sk, 2n])
  return { pkX, pkY }
}
```

---

## 테스트 시나리오

### Scenario 1: 지갑 연결
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 페이지 로드 | Landing 페이지 표시 |
| 2 | Connect Wallet 클릭 | MetaMask 팝업 |
| 3 | 지갑 연결 | 주소 표시, ZK Identity 생성 |
| 4 | 네트워크 확인 | Sepolia인지 확인 |

### Scenario 2: 제안 생성 (Demo Mode)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Proposals 페이지 이동 | 제안 목록 표시 |
| 2 | Create Proposal 클릭 | 제안 생성 폼 |
| 3 | 제목/설명 입력 | 입력값 반영 |
| 4 | Create 클릭 | 로컬 상태에 저장 (Demo) |

### Scenario 3: 투표 커밋 ❌ (현재 실패)
| Step | Action | Expected Result | 현재 상태 |
|------|--------|-----------------|-----------|
| 1 | 제안 클릭 | 상세 페이지 | ✅ |
| 2 | 투표 선택 (For/Against/Abstain) | 선택 표시 | ✅ |
| 3 | Generate Proof 클릭 | ZK proof 생성 | ❌ 가짜 proof |
| 4 | 트랜잭션 전송 | commitVote 호출 | ❌ InvalidProof 에러 |

### Scenario 4: 투표 공개 ❌ (현재 실패)
| Step | Action | Expected Result | 현재 상태 |
|------|--------|-----------------|-----------|
| 1 | Reveal Phase 진입 | 공개 버튼 표시 | ✅ |
| 2 | Reveal 클릭 | revealVote 호출 | ❌ commitment 불일치 |

---

## 수정 방안

### Option A: 실제 snarkjs 통합 (권장)
1. snarkjs + circomlibjs 패키지 사용
2. WASM witness calculator 로드
3. zkey 파일 로드 (또는 CDN)
4. 실제 Groth16 proof 생성

**장점**: 완전한 구현
**단점**: 번들 크기 증가 (~2MB), 초기 로딩 시간

### Option B: Mock Verifier 모드
1. 컨트랙트에 `isDemoMode` 플래그 추가
2. Demo 모드에서는 proof 검증 스킵
3. 프론트엔드 시연용

**장점**: 빠른 구현
**단점**: 실제 ZK 검증 안됨

### Option C: 백엔드 Proof 생성
1. API 서버에서 proof 생성
2. 프론트엔드는 API 호출만

**장점**: 프론트엔드 간단
**단점**: 추가 인프라 필요, 중앙화

---

## 권장 수정 순서

1. **circomlibjs 설치**: `npm install circomlibjs`
2. **실제 Poseidon 구현**: circomlibjs.poseidon 사용
3. **Baby Jubjub 키 유도**: circomlibjs.babyjub 사용
4. **snarkjs 통합**: 실제 proof 생성
5. **Circuit 파일 번들링**: WASM + zkey 로드

---

## 컨트랙트 테스트 (이미 통과)

```
28 tests passed
├── PrivateVoting.t.sol: 24 passed
└── RealProof.t.sol: 4 passed (실제 proof로 검증)
```

컨트랙트는 정상. **프론트엔드 zkproof.ts 수정 필요.**
