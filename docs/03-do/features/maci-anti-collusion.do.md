# Do: MACI Anti-Collusion Infrastructure 구현 가이드

> **Feature**: maci-anti-collusion
> **Phase**: Do (Implementation)
> **Created**: 2026-02-13
> **Status**: IN PROGRESS
> **Plan**: `docs/01-plan/features/maci-anti-collusion.plan.md`
> **Design**: `docs/02-design/features/maci-anti-collusion.design.md`

---

## 1. 구현 전 체크리스트

### 1.1 사전 조건

- [x] Plan 문서 완료 (`docs/01-plan/features/maci-anti-collusion.plan.md`)
- [x] Design 문서 완료 (`docs/02-design/features/maci-anti-collusion.design.md`)
- [x] D1/D2 Authoritative Spec 확보 (`docs/specs/d1-private-voting.spec.md`, `docs/specs/d2-quadratic.spec.md`)
- [ ] circomlibjs 0.1.7 설치 확인 (`package.json`에 존재)
- [ ] snarkjs 0.7.6 설치 확인 (`package.json`에 존재)
- [ ] Foundry (forge) 설치 확인
- [ ] Circom 2.1.6 설치 확인

### 1.2 환경 확인 명령어

```bash
# Circom 버전 확인
circom --version    # Expected: 2.1.6

# Foundry 확인
forge --version

# Node 패키지 확인
npm ls circomlibjs snarkjs
```

---

## 2. 구현 순서 (의존성 기반)

```
                 ┌─ Step 1: Crypto 모듈 ──────────────────────────────┐
                 │  (ECDH, Encrypt, EdDSA)                           │
                 │  의존성: 없음                                       │
                 └────────────────────┬──────────────────────────────┘
                                      │
    ┌─ Step 2: Merkle Tree ──────────┐│
    │  (IncrementalMerkleTree.sol)   ││
    │  의존성: 없음                   ││
    └──────────────┬─────────────────┘│
                   │                   │
    ┌──────────────▼───────────────────▼─────────────────────────────┐
    │  Step 3: PrivateVotingV2.sol                                   │
    │  (메인 컨트랙트)                                                │
    │  의존성: Step 2 (Merkle Tree)                                   │
    └──────────────┬──────────────────┬──────────────────────────────┘
                   │                   │
    ┌──────────────▼───────┐  ┌───────▼──────────────────────────────┐
    │  Step 4:             │  │  Step 5:                             │
    │  MessageProcessor    │  │  TallyVotes                          │
    │  .circom             │  │  .circom                             │
    │  의존성: Step 1, 3   │  │  의존성: Step 4                       │
    └──────────┬───────────┘  └───────┬──────────────────────────────┘
               │                       │
    ┌──────────▼───────────────────────▼─────────────────────────────┐
    │  Step 6: Coordinator 서비스                                     │
    │  의존성: Step 3, 4, 5                                           │
    └──────────────┬─────────────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────────────┐
    │  Step 7: 프론트엔드 V2                                          │
    │  의존성: Step 3, 6                                              │
    └──────────────┬─────────────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────────────┐
    │  Step 8: Key Change 확장                                        │
    │  의존성: Step 4                                                 │
    └────────────────────────────────────────────────────────────────┘
```

**병렬 실행 가능**: Step 1과 Step 2는 독립적이므로 동시 진행 가능

---

## 3. Step별 구현 상세

### Step 1: 암호화 인프라 모듈

**목표**: ECDH 키 교환, Poseidon 암호화, EdDSA 서명 — 프론트엔드와 Coordinator 공용

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `src/crypto/ecdh.ts` | ~60 | ECDH 공유 비밀키 생성 (Baby Jubjub) |
| `src/crypto/encrypt.ts` | ~80 | Poseidon 기반 대칭 암호화/복호화 |
| `src/crypto/eddsa.ts` | ~60 | EdDSA 서명 생성/검증 |
| `src/crypto/index.ts` | ~10 | 모듈 re-export |

**구현 체크리스트**:

- [ ] **`src/crypto/ecdh.ts`**
  - [ ] `generateECDHSharedKey(sk, otherPubKey)` — Baby Jubjub 스칼라 곱셈
  - [ ] `generateEphemeralKeyPair()` — 임시 키쌍 생성
  - [ ] 기존 `zkproof.ts`의 `buildBabyjub` 패턴 재사용
  - [ ] 단위 테스트: 양쪽에서 같은 shared key 도출 확인

- [ ] **`src/crypto/encrypt.ts`**
  - [ ] `poseidonEncrypt(plaintext[], sharedKey)` → `bigint[]`
  - [ ] `poseidonDecrypt(ciphertext[], sharedKey)` → `bigint[]`
  - [ ] CTR 모드: `ciphertext[i] = plaintext[i] + Poseidon(sharedKey, i)`
  - [ ] 단위 테스트: encrypt → decrypt 라운드트립

- [ ] **`src/crypto/eddsa.ts`**
  - [ ] `eddsaSign(message, sk)` — EdDSA-Poseidon 서명
  - [ ] `eddsaVerify(message, signature, pubKey)` — 서명 검증
  - [ ] `circomlibjs`의 `buildEddsa` 사용
  - [ ] 단위 테스트: sign → verify 성공/실패

**핵심 참조 코드**:
```typescript
// 기존 zkproof.ts에서 babyjub 사용 패턴 참고
import { buildBabyjub, buildPoseidon } from 'circomlibjs'
// buildBabyjub().mulPointEscalar() → ECDH에 재사용
```

**완료 기준**: 모든 crypto 함수에 대해 단위 테스트 통과

---

### Step 2: Incremental Merkle Tree 컨트랙트

**목표**: State Tree, Message Tree 용 온체인 Incremental Merkle Tree

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `contracts/IncrementalMerkleTree.sol` | ~150 | Poseidon 기반 증분 머클 트리 |
| `test/IncrementalMerkleTree.t.sol` | ~100 | Forge 테스트 |

**구현 체크리스트**:

- [ ] **`contracts/IncrementalMerkleTree.sol`**
  - [ ] `TREE_DEPTH = 20` 상수
  - [ ] `zeros[20]` — 각 레벨의 zero 값 (Poseidon(0,0) 체인)
  - [ ] `filledSubtrees[20]` — 현재 채워진 subtree 해시
  - [ ] `nextIndex` — 다음 삽입 위치
  - [ ] `root` — 현재 루트
  - [ ] `insertLeaf(uint256 leaf)` → 루트 업데이트
  - [ ] `_hashLeftRight(uint256 left, uint256 right)` → PoseidonT5 활용 (2-input은 별도 구현 필요)
  - [ ] 기존 `PoseidonT5.sol` 재사용 (4-input), 2-input Poseidon 추가 필요

- [ ] **Poseidon 2-input 해시**
  - [ ] `PoseidonT3.sol` 추가 또는 `poseidon-solidity` npm 패키지에서 생성
  - [ ] 머클 트리 내부 노드 해시에 사용

- [ ] **테스트**
  - [ ] 빈 트리 root 계산 일치
  - [ ] leaf 삽입 후 root 변경 확인
  - [ ] 20개 leaf 삽입 후 올바른 root
  - [ ] TypeScript 측 동일 연산 결과와 일치 (cross-verification)

**핵심 참조**:
```solidity
// 기존 PoseidonT5.sol (4-input) 패턴 참고
// 2-input Poseidon은 poseidon-solidity 패키지로 생성 가능
// npm: poseidon-solidity (이미 dependencies에 존재)
```

**완료 기준**: 온체인/오프체인 Merkle root 일치 테스트 통과

---

### Step 3: PrivateVotingV2.sol 메인 컨트랙트

**목표**: signUp → publishMessage → processMessages → tallyVotes 전체 흐름

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `contracts/PrivateVotingV2.sol` | ~400 | V2 메인 컨트랙트 |
| `test/PrivateVotingV2.t.sol` | ~400 | Forge 테스트 |

**구현 체크리스트**:

- [ ] **Constants & State**
  - [ ] `PHASE_VOTING = 0`, `PHASE_PROCESSING = 1`, `PHASE_FINALIZED = 2`
  - [ ] `coordinator` address + `coordinatorPubKeyX/Y`
  - [ ] `stateTree` (IncrementalMerkleTree)
  - [ ] `messageTree` (IncrementalMerkleTree)
  - [ ] `ProposalV2` struct (Design 4.1 참조)

- [ ] **`signUp(pubKeyX, pubKeyY, voiceCreditBalance)`**
  - [ ] State leaf = Poseidon(pubKeyX, pubKeyY, 0, voiceCreditBalance)
  - [ ] stateTree.insertLeaf(leaf)
  - [ ] emit `SignedUp` event
  - [ ] stateIndex 발급 (numSignUps++)

- [ ] **`createProposalV2(title, description, votingDuration, processDeadline)`**
  - [ ] proposalId 발급
  - [ ] endTime, processDeadline 설정
  - [ ] emit `ProposalCreatedV2` event

- [ ] **`publishMessage(proposalId, encMessage[7], encPubKeyX, encPubKeyY)`**
  - [ ] Phase 검증: `block.timestamp <= endTime`
  - [ ] messageLeaf 계산 (2-stage Poseidon hash)
  - [ ] messageTree.insertLeaf(messageLeaf)
  - [ ] emit `MessagePublished` event (encMessage 전체 포함!)

- [ ] **`processMessages(proposalId, newStateRoot, pA, pB, pC, pubSignals)`**
  - [ ] `onlyCoordinator` modifier
  - [ ] Phase 검증: 투표 종료 후
  - [ ] ZKP 검증: `msgVerifier.verifyProof()`
  - [ ] `stateTreeRoot = newStateRoot` 업데이트

- [ ] **`tallyVotes(proposalId, forVotes, againstVotes, abstainVotes, totalVoters, pA, pB, pC, pubSignals)`**
  - [ ] `onlyCoordinator` modifier
  - [ ] ZKP 검증: `tallyVerifier.verifyProof()`
  - [ ] 결과 기록, `tallyVerified = true`

- [ ] **View functions**
  - [ ] `getProposalV2()` — 제안 상세
  - [ ] `getPhaseV2()` — 현재 phase

- [ ] **Verifier interfaces**
  - [ ] `IMessageProcessorVerifier`
  - [ ] `ITallyVerifier`

- [ ] **revealVote 함수 없음 확인** (ABI에 reveal 관련 함수 0개)

**기존 코드 참조**:
- `ZkVotingFinal.sol` 구조 참고 (ProposalD1, IVerifierD1 패턴)
- `PoseidonT5.sol` import
- `Groth16Verifier.sol` verifyProof 시그니처

**테스트 체크리스트** (Design 12.1):

| # | 테스트 | 상태 |
|:-:|--------|:----:|
| 1 | `test_SignUp` — stateIndex 발급, State Tree 업데이트 | [ ] |
| 2 | `test_PublishMessage` — Message Tree 업데이트, 이벤트 | [ ] |
| 3 | `test_PublishMessage_AfterVotingPhase` — revert | [ ] |
| 4 | `test_ProcessMessages` — state root 업데이트 | [ ] |
| 5 | `test_ProcessMessages_InvalidProof` — revert | [ ] |
| 6 | `test_ProcessMessages_NotCoordinator` — revert | [ ] |
| 7 | `test_TallyVotes` — 결과 기록 | [ ] |
| 8 | `test_TallyVotes_InvalidProof` — revert | [ ] |
| 9 | `test_TallyVotes_AlreadyFinalized` — revert | [ ] |
| 10 | `test_NoRevealFunction` — ABI에 reveal 없음 | [ ] |
| 11 | `test_IntegrationFlow` — 전체 흐름 | [ ] |

**완료 기준**: 11개 테스트 전체 통과, `forge test` 성공

---

### Step 4: MessageProcessor 회로

**목표**: 메시지 복호화 → EdDSA 검증 → State transition 증명

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `circuits/MessageProcessor.circom` | ~300 | State transition 검증 회로 |
| `circuits/utils/ecdh.circom` | ~30 | ECDH 키 교환 circom |
| `circuits/utils/poseidonEncrypt.circom` | ~50 | Poseidon 암호화 circom |

**구현 체크리스트**:

- [ ] **Public Inputs**
  - [ ] `inputStateRoot` — 처리 전 state root
  - [ ] `outputStateRoot` — 처리 후 state root
  - [ ] `inputMessageRoot` — 메시지 트리 root
  - [ ] `coordinatorPubKeyX/Y` — Coordinator 공개키

- [ ] **Private Inputs (per message)**
  - [ ] `messages[batchSize][7]` — 암호화 메시지
  - [ ] `encPubKeys[batchSize][2]` — 임시 공개키
  - [ ] `coordinatorSk` — Coordinator 비밀키

- [ ] **Per-message 로직**
  - [ ] ECDH: `sharedKey = coordinatorSk * encPubKey`
  - [ ] Poseidon 복호화: `command = decrypt(message, sharedKey)`
  - [ ] EdDSA 서명 검증
  - [ ] Nonce 순서 검증
  - [ ] State leaf 업데이트
  - [ ] State tree root 재계산

- [ ] **기존 회로 재사용**
  - [ ] `MerkleProof` template (PrivateVoting.circom:25-59)
  - [ ] `SecretToPublic` template (PrivateVoting.circom:62-72)
  - [ ] Poseidon hash (circomlib)

- [ ] **컴파일 & 테스트**
  - [ ] `circom MessageProcessor.circom --r1cs --wasm --sym`
  - [ ] witness 생성 테스트 (유효 메시지)
  - [ ] witness 생성 실패 테스트 (무효 서명)

**예상 Constraint 수**: ~500K~1M (batchSize에 따라)

**완료 기준**: 유효/무효 메시지에 대한 witness 생성 성공/실패

---

### Step 5: TallyVotes 회로

**목표**: 최종 state에서 투표 집계 정확성 증명

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `circuits/TallyVotes.circom` | ~150 | 집계 검증 회로 |

**구현 체크리스트**:

- [ ] **Public Inputs**
  - [ ] `stateRoot` — 최종 state root
  - [ ] `tallyCommitment` — 이전 집계 commitment
  - [ ] `newTallyCommitment` — 업데이트된 집계 commitment

- [ ] **로직**
  - [ ] 배치 내 각 state leaf의 Merkle inclusion 검증
  - [ ] voteWeight가 voteOptionTree에서 정확한지 검증
  - [ ] 집계 합산: `tally[option] += voteWeight`
  - [ ] newTallyCommitment = Poseidon(tally[0], tally[1], ...)

- [ ] **D1/D2 모드 분기**
  - [ ] D1: `tally += votingPower` (1:1)
  - [ ] D2: `tally += numVotes` (quadratic cost는 이미 MessageProcessor에서 검증)

- [ ] **컴파일 & 테스트**

**예상 Constraint 수**: ~200K

**완료 기준**: 올바른/잘못된 tally에 대한 witness 성공/실패

---

### Step 6: Coordinator 서비스

**목표**: 오프체인 메시지 처리 + ZKP 생성 + 온체인 제출

**신규 디렉토리**:

```
coordinator/
├── src/
│   ├── index.ts              # 메인 엔트리
│   ├── crypto/
│   │   ├── ecdh.ts           # ECDH (src/crypto 재사용)
│   │   ├── encrypt.ts        # Poseidon 복호화
│   │   └── eddsa.ts          # EdDSA 검증
│   ├── trees/
│   │   ├── stateTree.ts      # State Tree 관리
│   │   ├── messageTree.ts    # Message Tree 관리
│   │   └── voteOptionTree.ts # Vote Option Tree (per user)
│   ├── processing/
│   │   ├── processMessages.ts # 메시지 순차 처리
│   │   ├── tally.ts          # 투표 집계
│   │   └── batchProof.ts     # 배치 ZKP 생성 (snarkjs)
│   └── chain/
│       ├── listener.ts       # 온체인 이벤트 수신
│       └── submitter.ts      # 트랜잭션 제출
├── package.json
└── tsconfig.json
```

**구현 체크리스트**:

- [ ] **이벤트 리스너** (`chain/listener.ts`)
  - [ ] `SignedUp` 이벤트 수신 → State Tree 동기화
  - [ ] `MessagePublished` 이벤트 수신 → Message 저장
  - [ ] `ProposalCreatedV2` 이벤트 수신 → 타이머 설정

- [ ] **메시지 처리** (`processing/processMessages.ts`)
  - [ ] 모든 메시지 순차 처리 (Design 6.2 시퀀스)
  - [ ] ECDH 복호화 → EdDSA 검증 → Nonce 검증
  - [ ] State leaf 업데이트
  - [ ] 무효 메시지 스킵 로직

- [ ] **D1/D2 분기** (`processing/processMessages.ts`)
  - [ ] `calculateCost(weight, mode)` — D1: linear, D2: quadratic
  - [ ] voiceCreditBalance 차감

- [ ] **집계** (`processing/tally.ts`)
  - [ ] 최종 State Tree에서 모든 유효 투표 합산
  - [ ] D1: `{forVotes, againstVotes, abstainVotes}`
  - [ ] D2: `{forVotes, againstVotes}` (abstain 없음)

- [ ] **ZKP 생성** (`processing/batchProof.ts`)
  - [ ] snarkjs로 processMessages proof 생성
  - [ ] snarkjs로 tallyVotes proof 생성
  - [ ] `.wasm` + `.zkey` 파일 경로 설정

- [ ] **온체인 제출** (`chain/submitter.ts`)
  - [ ] `processMessages()` tx 제출
  - [ ] `tallyVotes()` tx 제출
  - [ ] gas estimation + 에러 핸들링

**주요 의존성**:
```json
{
  "dependencies": {
    "ethers": "^6.x",
    "snarkjs": "^0.7.6",
    "circomlibjs": "^0.1.7"
  }
}
```

**완료 기준**: 로컬 Hardhat 네트워크에서 전체 플로우 (signUp → publish → process → tally) 성공

---

### Step 7: 프론트엔드 V2

**목표**: Reveal 제거, 암호화 투표 UI, Processing 대기 화면

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `src/components/voting/VoteFormV2.tsx` | ~200 | 암호화 투표 폼 |
| `src/components/voting/ProcessingStatus.tsx` | ~80 | "집계 진행 중" UI |
| `src/components/voting/KeyManager.tsx` | ~150 | 키 관리/변경 UI |
| `src/contractV2.ts` | ~200 | V2 ABI + 주소 |

**수정 파일**:

| 파일 | 변경 | 위험도 |
|------|------|:------:|
| `src/components/QuadraticVotingDemo.tsx` | V2 모드 분기, Phase 변경 | 높음 |
| `src/zkproof.ts` | ECDH/EdDSA import, encryptCommand 추가 | 높음 |
| `src/contract.ts` | V2 ABI/주소 추가 | 중 |
| `src/components/voting/PhaseIndicator.tsx` | V2 Phase (Voting/Processing/Finalized) | 낮음 |
| `src/components/voting/VoteResult.tsx` | tallyVerified 표시 | 낮음 |

**구현 체크리스트**:

- [ ] **`src/contractV2.ts`**
  - [ ] PrivateVotingV2 ABI 정의
  - [ ] 배포 주소 (추후 업데이트)
  - [ ] V2 전용 타입

- [ ] **`VoteFormV2.tsx`**
  - [ ] 투표 선택 UI (D1: 3옵션, D2: 2옵션)
  - [ ] ECDH 암호화 로직 (handleVoteV2, Design 9.4)
  - [ ] `publishMessage()` 호출
  - [ ] nonce 관리 (localStorage)
  - [ ] **Reveal 관련 코드 없음** 확인

- [ ] **`ProcessingStatus.tsx`**
  - [ ] Phase == PROCESSING 시 대기 UI
  - [ ] "Coordinator가 집계 중입니다" 메시지
  - [ ] 예상 완료 시간 표시

- [ ] **`KeyManager.tsx`**
  - [ ] 현재 EdDSA 키 표시 (공개키만)
  - [ ] "키 변경" 버튼 → 새 키쌍 생성 → publishMessage(keyChange)
  - [ ] 키 변경 확인 UI

- [ ] **`QuadraticVotingDemo.tsx` 수정**
  - [ ] V1/V2 모드 토글 또는 V2 전용
  - [ ] Phase: Voting / Processing / Finalized
  - [ ] RevealForm 렌더링 조건 제거

- [ ] **폐기 확인**
  - [ ] `RevealForm.tsx` — V2에서 import 없음 확인
  - [ ] localStorage reveal 데이터 저장 코드 — 제거/분기

**완료 기준**: 프론트엔드에서 V2 투표 전체 흐름 동작

---

### Step 8: Key Change 확장

**목표**: 투표 기간 중 키 변경으로 Anti-Coercion 완성

**수정 파일**:

| 파일 | 변경 |
|------|------|
| `circuits/MessageProcessor.circom` | key change 분기 로직 |
| `coordinator/src/processing/processMessages.ts` | key change 처리 |
| `src/components/voting/KeyManager.tsx` | UI 완성 |

**구현 체크리스트**:

- [ ] **MessageProcessor 회로 확장**
  - [ ] `if (newPubKey != currentPubKey)` → 키 변경
  - [ ] 이전 키로 서명된 후속 메시지 무효화
  - [ ] state leaf의 pubKey 업데이트

- [ ] **Coordinator 처리**
  - [ ] key change 감지 및 적용
  - [ ] 이전 키 서명 무효 처리
  - [ ] 투표 리셋 처리

- [ ] **시나리오 테스트** (Design 12.3):

| # | 시나리오 | 상태 |
|:-:|---------|:----:|
| 1 | 강압 투표 후 키 변경 + 재투표 → 재투표가 최종 | [ ] |
| 2 | 매수자가 투표 내용 확인 시도 → 암호화로 불가 | [ ] |
| 3 | 매수자에게 이전 키 제공 → 키 변경됨, 무효 투표 | [ ] |
| 4 | Coordinator가 투표 누락 시도 → proof 실패 | [ ] |

**완료 기준**: 4개 anti-coercion 시나리오 테스트 통과

---

## 4. 기존 코드 재사용 매핑

### 4.1 직접 재사용 (변경 없음)

| 기존 파일 | V2에서의 역할 |
|-----------|-------------|
| `contracts/PoseidonT5.sol` | State leaf 해싱 |
| `contracts/Groth16Verifier.sol` | 투표 자격 검증 (signUp 시) |
| `circuits/PrivateVoting.circom` → `MerkleProof` template | State/Message Tree 검증 |
| `circuits/PrivateVoting.circom` → `SecretToPublic` template | 키 소유권 증명 |
| `src/workers/proofWorkerHelper.ts` | Web Worker 증명 생성 |
| `src/workers/zkProofWorker.ts` | Web Worker |

### 4.2 수정하여 재사용

| 기존 파일 | 변경 사항 |
|-----------|----------|
| `src/zkproof.ts` | ECDH/EdDSA 함수 추가, `generateVoteProofV2()` 추가 |
| `src/contract.ts` | V2 ABI/주소 export 추가 |
| `src/hooks/useVotingMachine.ts` | V2 상태 머신 분기 |

### 4.3 V2 완성 후 폐기 대상

| 파일/함수 | 이유 |
|-----------|------|
| `src/components/voting/RevealForm.tsx` | Reveal 불필요 |
| `ZkVotingFinal.sol` → `revealVoteD1/D2()` | V2에서 제거 |
| localStorage `zk-vote-reveal-*` 키 | Reveal 데이터 불필요 |

---

## 5. 스펙 준수 사항 (절대 변경 금지)

### D1 Private Voting (d1-private-voting.spec.md)

| 항목 | 값 | 참조 |
|------|---|------|
| Public Inputs | voteCommitment, proposalId, votingPower, merkleRoot | spec:32-39 |
| Commitment | `Poseidon(choice, votingPower, proposalId, voteSalt)` 4-input | spec:115-120 |
| Note Hash | `Poseidon(pkX, pkY, noteValue, tokenType, noteSalt)` 5-input | spec:81-87 |
| Choice | {0=against, 1=for, 2=abstain} | spec:107-111 |
| Tree Depth | 20 levels | spec:123-124 |
| Nullifier | `Poseidon(sk, proposalId)` | spec 참조 |

### D2 Quadratic Voting (d2-quadratic.spec.md)

| 항목 | 값 | 참조 |
|------|---|------|
| Public Inputs | voteCommitment, proposalId, creditsSpent, creditRoot | spec:33-39 |
| Commitment | `Poseidon(choice, numVotes, creditsSpent, proposalId, voteSalt)` 5-input | spec:129-136 |
| Credit Note | `Poseidon(pkX, pkY, totalCredits, creditSalt)` 4-input | spec:85-90 |
| Choice | {0=against, 1=for} (binary ONLY, NO abstain) | spec:120-121 |
| Cost | `creditsSpent = numVotes * numVotes` | spec:108-109 |
| Balance | `voteCost <= totalCredits` | spec:112-115 |

---

## 6. 위험 요소 및 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| PoseidonT3 (2-input) 온체인 없음 | Merkle Tree 빌드 불가 | `poseidon-solidity` 패키지에서 생성 |
| MessageProcessor 회로 너무 큼 | 증명 시간 수십 분 | batchSize 줄이기 (5→1), 서버사이드 증명 |
| Trusted Setup 필요 | 보안 신뢰 의존 | Powers of Tau ceremony 재사용 |
| Coordinator 단일 장애점 | 집계 지연 | processDeadline + backup coordinator |
| V1↔V2 병행 시 상태 혼란 | 사용자 혼란 | V2 전용 UI, V1은 읽기 전용 |

---

## 7. 브랜치 전략

```
main
  └── feature/maci-v2-core
        ├── feature/maci-crypto        (Step 1)
        ├── feature/maci-merkle-tree   (Step 2)
        ├── feature/maci-contract-v2   (Step 3)
        ├── feature/maci-circuits      (Step 4, 5)
        ├── feature/maci-coordinator   (Step 6)
        ├── feature/maci-frontend-v2   (Step 7)
        └── feature/maci-key-change    (Step 8)
```

**권장**: Step 1~3 완료 후 중간 PR → 리뷰 → Step 4~8 진행

---

## 8. 실행 명령어 참조

```bash
# Step 1: Crypto 모듈 테스트
npx vitest run src/crypto/

# Step 2: Merkle Tree 테스트
forge test --match-contract IncrementalMerkleTreeTest -vvv

# Step 3: V2 컨트랙트 테스트
forge test --match-contract PrivateVotingV2Test -vvv

# Step 4: 회로 컴파일
circom circuits/MessageProcessor.circom --r1cs --wasm --sym -o circuits/build_v2/

# Step 5: 회로 컴파일
circom circuits/TallyVotes.circom --r1cs --wasm --sym -o circuits/build_v2/

# Step 6: Coordinator 테스트
cd coordinator && npm test

# Step 7: 프론트엔드 실행
npm run dev

# 전체 테스트
forge test && npx vitest run
```

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-13 | AI | Design 기반 초기 Do 가이드 작성 |
