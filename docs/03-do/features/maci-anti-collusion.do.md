# Do: MACI Anti-Collusion Infrastructure 구현 가이드

> **Feature**: maci-anti-collusion
> **Phase**: Do (Implementation)
> **Created**: 2026-02-13
> **Updated**: 2026-02-13
> **Status**: IN PROGRESS
> **Plan**: `docs/01-plan/features/maci-anti-collusion.plan.md`
> **Design**: `docs/02-design/features/maci-anti-collusion.design.md`

---

## 1. 구현 전 체크리스트

### 1.1 사전 조건

- [x] Plan 문서 완료 (MACI 100% 반영)
- [x] Design 문서 완료 (MACI 분리 패턴, 역순 처리, DuplexSponge, Quinary+AccQueue)
- [x] D1/D2 Authoritative Spec 확보 (`docs/specs/d1-private-voting.spec.md`, `docs/specs/d2-quadratic.spec.md`)
- [ ] circomlibjs 0.1.7 설치 확인 (`package.json`에 존재)
- [ ] snarkjs 0.7.6 설치 확인 (`package.json`에 존재)
- [ ] @noble/hashes 설치 (BLAKE512용)
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

# BLAKE512 패키지 (신규 필요)
npm install @noble/hashes
```

---

## 2. 구현 순서 (의존성 기반)

```
                 ┌─ Step 1: Crypto 모듈 ──────────────────────────────┐
                 │  (ECDH, DuplexSponge, EdDSA, BLAKE512)             │
                 │  의존성: 없음                                       │
                 └────────────────────┬──────────────────────────────┘
                                      │
    ┌─ Step 2: AccQueue + Quinary ──┐│
    │  (AccQueue.sol, PoseidonT3/T6)││
    │  의존성: 없음                  ││
    └──────────────┬────────────────┘│
                   │                  │
    ┌──────────────▼──────────────────▼─────────────────────────────┐
    │  Step 3: MACI 분리 컨트랙트                                    │
    │  (MACI.sol, Poll.sol, MessageProcessor.sol, Tally.sol,        │
    │   VkRegistry, Gatekeepers, VoiceCreditProxy, DomainObjs)      │
    │  의존성: Step 2                                                │
    └──────────────┬──────────────────┬──────────────────────────────┘
                   │                   │
    ┌──────────────▼───────┐  ┌───────▼──────────────────────────────┐
    │  Step 4:             │  │  Step 5:                             │
    │  MessageProcessor    │  │  TallyVotes                          │
    │  .circom             │  │  .circom                             │
    │  (역순, index 0,     │  │  (tally commitment 3-input)          │
    │   DuplexSponge,      │  │  의존성: Step 4                       │
    │   SHA256, Quinary)   │  │                                      │
    │  의존성: Step 1, 3   │  │                                      │
    └──────────┬───────────┘  └───────┬──────────────────────────────┘
               │                       │
    ┌──────────▼───────────────────────▼─────────────────────────────┐
    │  Step 6: Coordinator 서비스                                     │
    │  (역순 처리, AccQueue merge, DuplexSponge 복호화)               │
    │  의존성: Step 3, 4, 5                                           │
    └──────────────┬─────────────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────────────┐
    │  Step 7: 프론트엔드 V2                                          │
    │  (VoteFormV2, MergingStatus, ProcessingStatus, KeyManager)     │
    │  의존성: Step 3, 6                                              │
    └──────────────┬─────────────────────────────────────────────────┘
                   │
    ┌──────────────▼─────────────────────────────────────────────────┐
    │  Step 8: Key Change 확장                                        │
    │  (Anti-Coercion 완성)                                           │
    │  의존성: Step 4                                                 │
    └────────────────────────────────────────────────────────────────┘
```

**병렬 실행 가능**: Step 1과 Step 2는 독립적이므로 동시 진행 가능

---

## 3. Step별 구현 상세

### Step 1: 암호화 인프라 모듈 (MACI 100% 매핑)

**목표**: ECDH, Poseidon DuplexSponge, EdDSA, BLAKE512 — 프론트엔드와 Coordinator 공용

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `src/crypto/ecdh.ts` | ~60 | ECDH 공유 비밀키 생성 (Baby Jubjub) |
| `src/crypto/duplexSponge.ts` | ~80 | Poseidon DuplexSponge 암호화/복호화 |
| `src/crypto/eddsa.ts` | ~60 | EdDSA-Poseidon 서명 생성/검증 |
| `src/crypto/blake512.ts` | ~40 | BLAKE512 키 파생 (RFC 8032 스타일) |
| `src/crypto/index.ts` | ~10 | 모듈 re-export |

**구현 체크리스트**:

- [ ] **`src/crypto/ecdh.ts`**
  - [ ] `generateECDHSharedKey(sk, otherPubKey)` — Baby Jubjub 스칼라 곱셈
  - [ ] `generateEphemeralKeyPair()` — 임시 키쌍 생성 (BLAKE512 파생)
  - [ ] 기존 `zkproof.ts`의 `buildBabyjub` 패턴 재사용
  - [ ] 단위 테스트: 양쪽에서 같은 shared key 도출 확인

- [ ] **`src/crypto/duplexSponge.ts`** (★ CTR 모드가 아닌 DuplexSponge)
  - [ ] `poseidonDuplexSpongeEncrypt(plaintext[], sharedKey, nonce)` → `bigint[]`
  - [ ] `poseidonDuplexSpongeDecrypt(ciphertext[], sharedKey, nonce)` → `bigint[]`
  - [ ] Sponge 구조: state 초기화 → permutation → squeeze/absorb
  - [ ] **참조**: MACI 원본 `@pse/zk-kit` 패키지 또는 `maci-crypto`
  - [ ] 단위 테스트: encrypt → decrypt 라운드트립

- [ ] **`src/crypto/eddsa.ts`**
  - [ ] `eddsaSign(message, sk)` — EdDSA-Poseidon 서명
  - [ ] `eddsaVerify(message, signature, pubKey)` — 서명 검증
  - [ ] `circomlibjs`의 `buildEddsa` + `signPoseidon` 사용
  - [ ] 단위 테스트: sign → verify 성공/실패

- [ ] **`src/crypto/blake512.ts`** (★ 신규 — MACI 키 파생)
  - [ ] `derivePrivateKey(seed: Uint8Array)` → `bigint`
  - [ ] BLAKE2b-512 해시 → pruning (RFC 8032) → Baby Jubjub suborder modular
  - [ ] `@noble/hashes` 패키지 사용
  - [ ] 단위 테스트: 동일 seed → 동일 sk, 유효한 Baby Jubjub 스칼라

**핵심 참조 코드**:
```typescript
// 기존 zkproof.ts에서 babyjub 사용 패턴 참고
import { buildBabyjub, buildPoseidon, buildEddsa } from 'circomlibjs'
// buildBabyjub().mulPointEscalar() → ECDH에 재사용
// buildEddsa().signPoseidon() → EdDSA에 사용
```

**완료 기준**: 모든 crypto 함수에 대해 단위 테스트 통과 (ECDH, DuplexSponge, EdDSA, BLAKE512)

---

### Step 2: AccQueue + Quinary Tree 컨트랙트

**목표**: MACI의 Quinary AccQueue 패턴으로 온체인 트리 관리

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `contracts/AccQueue.sol` | ~300 | Quinary (5-ary) 누적 큐 |
| `contracts/PoseidonT3.sol` | ~700 | 2-input Poseidon (머클 내부 노드) |
| `contracts/PoseidonT6.sol` | ~700 | 5-input Poseidon (Quinary 트리 해싱) |
| `contracts/DomainObjs.sol` | ~20 | 공유 상수 (SNARK_SCALAR_FIELD 등) |
| `test/AccQueue.t.sol` | ~200 | Forge 테스트 |

**구현 체크리스트**:

- [ ] **`contracts/AccQueue.sol`** (★ Binary IMT 대신 Quinary AccQueue)
  - [ ] `arity = 5` (quinary)
  - [ ] `depth` — 구성 가능 (State: 10, Message: 10)
  - [ ] `enqueue(uint256 leaf)` — leaf 추가, subtree 자동 빌드
  - [ ] `mergeSubRoots(uint256 numOps)` — subtree roots 점진적 merge
  - [ ] `merge()` — 최종 root 확정
  - [ ] `getMainRoot()` — merge 후 root 조회
  - [ ] 내부 해싱: PoseidonT6 (5-input) 사용

- [ ] **`contracts/PoseidonT3.sol`** (2-input Poseidon)
  - [ ] `poseidon-solidity` 패키지로 생성 또는 직접 구현
  - [ ] 2-input 해시: Ballot 해싱, 내부 노드 해싱에 사용

- [ ] **`contracts/PoseidonT6.sol`** (5-input Poseidon)
  - [ ] Quinary 트리 노드 해싱에 필수
  - [ ] State leaf 해싱: `poseidon_4` → PoseidonT5 (4-input) 사용
  - [ ] AccQueue 노드: `poseidon_5` → PoseidonT6 (5-input) 사용

- [ ] **`contracts/DomainObjs.sol`**
  - [ ] `SNARK_SCALAR_FIELD` 상수
  - [ ] `BLANK_STATE_LEAF_HASH` — Pedersen generator 기반 고정값

- [ ] **테스트**
  - [ ] 빈 AccQueue root 일치
  - [ ] leaf enqueue 후 subtree 생성 확인
  - [ ] mergeSubRoots + merge 후 올바른 root
  - [ ] TypeScript 오프체인 Quinary tree와 root 일치 (cross-verification)
  - [ ] 가스 사용량 프로파일링 (enqueue, merge)

**핵심 참조**:
```solidity
// 기존 PoseidonT5.sol (4-input) 패턴 참고
// PoseidonT3/T6는 poseidon-solidity 패키지 또는 MACI 컨트랙트에서 참조
// MACI GitHub: contracts/contracts/trees/AccQueue.sol
```

**완료 기준**: 온체인 AccQueue root == 오프체인 Quinary tree root (cross-verification)

---

### Step 3: MACI 분리 컨트랙트

**목표**: MACI.sol + Poll.sol + MessageProcessor.sol + Tally.sol 분리 패턴

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `contracts/MACI.sol` | ~200 | signUp + deployPoll |
| `contracts/Poll.sol` | ~250 | publishMessage + AccQueue merge |
| `contracts/MessageProcessor.sol` | ~150 | processMessages (SHA256 공개입력) |
| `contracts/Tally.sol` | ~200 | tallyVotes + publishResults |
| `contracts/VkRegistry.sol` | ~80 | 검증키 레지스트리 |
| `contracts/gatekeepers/ISignUpGatekeeper.sol` | ~10 | 인터페이스 |
| `contracts/gatekeepers/FreeForAllGatekeeper.sol` | ~15 | 기본 구현 |
| `contracts/voiceCreditProxy/IVoiceCreditProxy.sol` | ~10 | 인터페이스 |
| `contracts/voiceCreditProxy/ConstantVoiceCreditProxy.sol` | ~15 | 기본 구현 |
| `test/MACI.t.sol` | ~300 | MACI + Poll 테스트 |
| `test/MessageProcessor.t.sol` | ~200 | MessageProcessor 테스트 |
| `test/Tally.t.sol` | ~200 | Tally 테스트 |

**구현 체크리스트**:

- [ ] **`contracts/MACI.sol`** (★ 기존 단일 컨트랙트에서 분리)
  - [ ] `stateAq` — State AccQueue (quinary, depth 10)
  - [ ] `signUpGatekeeper` — ISignUpGatekeeper
  - [ ] `voiceCreditProxy` — IVoiceCreditProxy
  - [ ] constructor: blank state leaf (index 0) enqueue
  - [ ] `signUp(pubKeyX, pubKeyY, gatekeeperData, voiceCreditData)`
    - [ ] Gatekeeper 검증
    - [ ] VoiceCreditProxy 조회
    - [ ] State leaf = `poseidon_4([pkX, pkY, balance, timestamp])` ← MACI 4-input
    - [ ] stateAq.enqueue(leaf)
    - [ ] emit SignUp event
  - [ ] `deployPoll(title, duration, coordPubKey, verifier, vkRegistry, msgTreeDepth)`
    - [ ] Poll + MessageProcessor + Tally 배포
    - [ ] polls mapping 등록
  - [ ] **revealVote 함수 없음** 확인

- [ ] **`contracts/Poll.sol`** (★ 투표 전용)
  - [ ] `messageAq` — Message AccQueue
  - [ ] `coordinatorPubKeyX/Y`
  - [ ] `publishMessage(encMessage[10], encPubKeyX, encPubKeyY)`
    - [ ] Voting 기간 검증
    - [ ] messageLeaf 해싱 (다단계 Poseidon)
    - [ ] messageAq.enqueue(leaf)
    - [ ] emit MessagePublished event (encMessage 전체 포함!)
  - [ ] AccQueue merge 함수들 (투표 종료 후)
    - [ ] `mergeMaciStateAqSubRoots(numOps)`
    - [ ] `mergeMaciStateAq()`
    - [ ] `mergeMessageAqSubRoots(numOps)`
    - [ ] `mergeMessageAq()`
  - [ ] `isVotingOpen()` view function

- [ ] **`contracts/MessageProcessor.sol`** (★ State transition 검증)
  - [ ] `processMessages(newStateCommitment, pA, pB, pC)`
    - [ ] Voting 종료 확인
    - [ ] AccQueue merge 완료 확인
    - [ ] SHA256 public input 해시 구성 → Groth16 검증
    - [ ] currentStateCommitment 업데이트
  - [ ] `processingComplete` 플래그

- [ ] **`contracts/Tally.sol`** (★ 집계 검증)
  - [ ] `tallyVotes(newTallyCommitment, pA, pB, pC)`
    - [ ] processing 완료 확인
    - [ ] SHA256 public input → Groth16 검증
    - [ ] tallyCommitment 업데이트
  - [ ] `publishResults(forVotes, againstVotes, abstainVotes, totalVoters, proof)`
    - [ ] tallyCommitment과 Merkle 일치 검증
    - [ ] 결과 기록, tallyVerified = true

- [ ] **`contracts/VkRegistry.sol`**
  - [ ] `setVerifyingKeys(stateTreeDepth, msgTreeDepth, processVk, tallyVk)`
  - [ ] process/tally 회로별 검증키 저장

- [ ] **Gatekeeper & VoiceCreditProxy**
  - [ ] `ISignUpGatekeeper.register(user, data)`
  - [ ] `FreeForAllGatekeeper` — 무조건 통과
  - [ ] `IVoiceCreditProxy.getVoiceCredits(user, data)` → uint256
  - [ ] `ConstantVoiceCreditProxy(amount)` — 고정 credit

**테스트 체크리스트** (Design 12.1):

| # | 테스트 | 상태 |
|:-:|--------|:----:|
| 1 | `test_MACI_SignUp` — stateIndex 발급, AccQueue 업데이트 | [ ] |
| 2 | `test_MACI_SignUp_Gatekeeper` — Gatekeeper 실패 revert | [ ] |
| 3 | `test_Poll_PublishMessage` — Message AccQueue 업데이트, 이벤트 | [ ] |
| 4 | `test_Poll_PublishMessage_AfterVoting` — revert | [ ] |
| 5 | `test_Poll_MergeAccQueues` — merge 후 root 확정 | [ ] |
| 6 | `test_MessageProcessor_Process` — state commitment 업데이트 | [ ] |
| 7 | `test_MessageProcessor_InvalidProof` — revert | [ ] |
| 8 | `test_MessageProcessor_NotMerged` — merge 전 process revert | [ ] |
| 9 | `test_Tally_TallyVotes` — tally commitment 업데이트 | [ ] |
| 10 | `test_Tally_InvalidProof` — revert | [ ] |
| 11 | `test_Tally_PublishResults` — 결과 기록 | [ ] |
| 12 | `test_NoRevealFunction` — 모든 ABI에 reveal 없음 | [ ] |
| 13 | `test_IntegrationFlow` — signUp → publish → merge → process → tally | [ ] |

**완료 기준**: 13개 테스트 전체 통과, `forge test` 성공

---

### Step 4: MessageProcessor 회로 (MACI 100% 반영)

**목표**: 역순 처리 + index 0 라우팅 + DuplexSponge + SHA256 + Quinary

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `circuits/MessageProcessor.circom` | ~400 | State transition 검증 (MACI 완전 반영) |
| `circuits/utils/quinaryMerkleProof.circom` | ~60 | Quinary (5-ary) Merkle proof |
| `circuits/utils/duplexSponge.circom` | ~80 | Poseidon DuplexSponge |
| `circuits/utils/sha256Hasher.circom` | ~40 | SHA256 public input 해싱 |
| `circuits/utils/unpackCommand.circom` | ~40 | Binary-packed command → fields |

**구현 체크리스트**:

- [ ] **Public Inputs (SHA256 압축)**
  - [ ] `inputHash` — SHA256(모든 public values) % SNARK_SCALAR_FIELD
  - [ ] 내부: inputStateRoot, outputStateRoot, inputBallotRoot, outputBallotRoot, inputMessageRoot, coordPubKeyHash, batchStartIndex, batchEndIndex

- [ ] **Private Inputs (per message)**
  - [ ] `messages[batchSize][10]` — DuplexSponge 암호화 (10 필드)
  - [ ] `encPubKeys[batchSize][2]` — 임시 공개키
  - [ ] `coordinatorSk` — Coordinator 비밀키
  - [ ] `stateLeaves[batchSize][4]` — [pkX, pkY, balance, timestamp]
  - [ ] `ballots[batchSize]` — ballot hashes
  - [ ] `stateProofs[batchSize][]` — Quinary Merkle proofs
  - [ ] `messageProofs[batchSize][]` — Quinary Merkle proofs

- [ ] **Per-message 로직** (★ 역순 처리)
  - [ ] messages[0] = 가장 마지막 메시지 (MACI 핵심)
  - [ ] ECDH: `sharedKey = coordinatorSk * encPubKey` (Baby Jubjub)
  - [ ] Poseidon DuplexSponge 복호화 (★ CTR이 아님)
  - [ ] Command unpack (binary → stateIndex, newPubKey, voteOption, weight, nonce, pollId, salt)
  - [ ] EdDSA-Poseidon 서명 검증
  - [ ] 유효성 검증:
    - [ ] stateIndex < numSignUps
    - [ ] nonce === ballot.nonce + 1
    - [ ] voiceCreditBalance + (currentWeight² - newWeight²) >= 0
    - [ ] newVoteWeight < sqrt(SNARK_FIELD)
    - [ ] voteOptionIndex < maxVoteOptions
  - [ ] ★ 유효/무효 분기 (Mux):
    - [ ] isValid ? stateIndex : 0 (★ blank leaf로 라우팅)
    - [ ] 회로 내에서 무효 → index 0 적용 증명
  - [ ] State leaf 업데이트: `poseidon_4([newPkX, newPkY, newBalance, timestamp])`
  - [ ] Ballot 업데이트: `poseidon_2([newNonce, newVoteOptionRoot])`
  - [ ] Quinary State Tree root 재계산
  - [ ] Quinary Ballot Tree root 재계산

- [ ] **`circuits/utils/quinaryMerkleProof.circom`** (★ Binary → Quinary)
  - [ ] `QuinaryMerkleProof(depth)` template
  - [ ] `path_index[depth]` — 0~4 (5-ary 위치)
  - [ ] `path_elements[depth][4]` — 형제 노드 (5-1=4개)
  - [ ] Poseidon(5) 해싱 (PoseidonT6)

- [ ] **`circuits/utils/duplexSponge.circom`** (★ CTR → DuplexSponge)
  - [ ] `PoseidonDuplexSpongeDecrypt(length)` template
  - [ ] Sponge state 관리
  - [ ] field subtraction으로 복호화

- [ ] **`circuits/utils/sha256Hasher.circom`** (★ 신규)
  - [ ] SHA256 해싱 (circomlib의 sha256 사용)
  - [ ] public input을 SHA256으로 압축 → 단일 uint256

- [ ] **기존 회로 참조** (수정 필요)
  - [ ] `MerkleProof` → `QuinaryMerkleProof`로 대체
  - [ ] `SecretToPublic` template — 재사용

- [ ] **컴파일 & 테스트**
  - [ ] `circom circuits/MessageProcessor.circom --r1cs --wasm --sym`
  - [ ] witness 생성: 유효 메시지 (state transition)
  - [ ] witness 생성: 무효 서명 → index 0 라우팅
  - [ ] witness 생성: 역순 처리 검증
  - [ ] SHA256 해시 일치 (온체인 vs 회로)

**예상 Constraint 수**: ~500K~1M (batchSize에 따라)

**완료 기준**: 유효/무효/역순 메시지에 대한 witness 생성 성공 + SHA256 일치

---

### Step 5: TallyVotes 회로

**목표**: 최종 state에서 투표 집계 + tally commitment 3-input

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `circuits/TallyVotes.circom` | ~200 | 집계 검증 회로 |

**구현 체크리스트**:

- [ ] **Public Inputs (SHA256 압축)**
  - [ ] `inputHash` — SHA256(stateCommitment, tallyCommitment, newTallyCommitment, batchNum) % p

- [ ] **로직**
  - [ ] 배치 내 각 state leaf의 Quinary Merkle inclusion 검증
  - [ ] Ballot에서 각 option의 voteWeight 검증
  - [ ] 집계 합산: `newTally[option] = currentTally[option] + voteWeight`

- [ ] **Tally commitment (★ MACI 3-input)**
  - [ ] `newTallyCommitment = poseidon_3([tallyResultsRoot, totalSpentVoiceCredits, perVoteOptionSpentRoot])`
  - [ ] D1: `tally += votingPower` (1:1)
  - [ ] D2: `tally += numVotes` (quadratic cost는 MessageProcessor에서 이미 검증)

- [ ] **SHA256 input hash 검증**

- [ ] **컴파일 & 테스트**

**예상 Constraint 수**: ~200K

**완료 기준**: 올바른/잘못된 tally에 대한 witness 성공/실패

---

### Step 6: Coordinator 서비스 (MACI 워크플로우)

**목표**: 역순 메시지 처리 + AccQueue merge + DuplexSponge 복호화 + ZKP 생성

**신규 디렉토리**:

```
coordinator/
├── src/
│   ├── index.ts              # 메인 엔트리
│   ├── crypto/
│   │   ├── ecdh.ts           # ECDH (src/crypto 재사용)
│   │   ├── duplexSponge.ts   # DuplexSponge 복호화
│   │   ├── eddsa.ts          # EdDSA 검증
│   │   ├── blake512.ts       # BLAKE512 키 파생
│   │   └── sha256.ts         # SHA256 public input 해싱
│   ├── trees/
│   │   ├── quinaryTree.ts    # Quinary Merkle Tree
│   │   ├── stateTree.ts      # State Tree 관리
│   │   ├── ballotTree.ts     # Ballot Tree 관리 (★ 신규)
│   │   ├── messageTree.ts    # Message Tree 관리
│   │   └── accQueue.ts       # AccQueue 오프체인 재구축
│   ├── processing/
│   │   ├── processMessages.ts # ★ 역순 메시지 처리
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
  - [ ] `SignUp` 이벤트 수신 → State Tree 동기화
  - [ ] `MessagePublished` 이벤트 수신 → Message 저장
  - [ ] `DeployPoll` 이벤트 수신

- [ ] **Quinary Tree** (`trees/quinaryTree.ts`)
  - [ ] Quinary (5-ary) Merkle Tree 구현
  - [ ] Poseidon(5) 해싱
  - [ ] insert, update, getLeaf, getProof, root

- [ ] **AccQueue 오프체인** (`trees/accQueue.ts`)
  - [ ] 온체인 AccQueue와 동일한 로직 재현
  - [ ] enqueue + merge로 오프체인 트리 재구축

- [ ] **★ 역순 메시지 처리** (`processing/processMessages.ts`)
  - [ ] `[...messages].reverse()` — 마지막 → 처음
  - [ ] ECDH 복호화 (Poseidon DuplexSponge, ★ CTR이 아님)
  - [ ] Command unpack (binary → fields)
  - [ ] EdDSA 서명 검증
  - [ ] 유효성 검증 (nonce, credit, range)
  - [ ] ★ 유효 → State/Ballot transition 적용
  - [ ] ★ 무효 → blank leaf (index 0)로 라우팅

- [ ] **AccQueue merge 호출** (`chain/submitter.ts`)
  - [ ] `poll.mergeMaciStateAqSubRoots(0)`
  - [ ] `poll.mergeMaciStateAq()`
  - [ ] `poll.mergeMessageAqSubRoots(0)`
  - [ ] `poll.mergeMessageAq()`

- [ ] **D1/D2 분기** (`processing/processMessages.ts`)
  - [ ] D1: linear cost (`newWeight - currentWeight`)
  - [ ] D2: quadratic cost (`newWeight² - currentWeight²`)

- [ ] **집계** (`processing/tally.ts`)
  - [ ] 최종 State + Ballot Tree에서 모든 유효 투표 합산
  - [ ] tallyCommitment = `poseidon_3([votesRoot, totalSpent, perOptionSpent])`
  - [ ] D1: `{forVotes, againstVotes, abstainVotes}`
  - [ ] D2: `{forVotes, againstVotes}` (abstain 없음)

- [ ] **ZKP 생성** (`processing/batchProof.ts`)
  - [ ] snarkjs로 processMessages proof 생성
  - [ ] snarkjs로 tallyVotes proof 생성
  - [ ] SHA256 public input 해시 생성
  - [ ] `.wasm` + `.zkey` 파일 경로 설정

- [ ] **온체인 제출** (`chain/submitter.ts`)
  - [ ] `messageProcessor.processMessages()` tx
  - [ ] `tally.tallyVotes()` tx
  - [ ] `tally.publishResults()` tx
  - [ ] gas estimation + 에러 핸들링

**주요 의존성**:
```json
{
  "dependencies": {
    "ethers": "^6.x",
    "snarkjs": "^0.7.6",
    "circomlibjs": "^0.1.7",
    "@noble/hashes": "^1.x"
  }
}
```

**완료 기준**: 로컬 Hardhat 네트워크에서 전체 플로우 (signUp → publish → merge → process → tally → results) 성공

---

### Step 7: 프론트엔드 V2

**목표**: DuplexSponge 암호화 투표 + AccQueue merge 대기 + Processing 대기

**신규 파일**:

| 파일 | LOC | 설명 |
|------|:---:|------|
| `src/components/voting/VoteFormV2.tsx` | ~200 | DuplexSponge 암호화 투표 폼 |
| `src/components/voting/MergingStatus.tsx` | ~60 | AccQueue merge 대기 UI |
| `src/components/voting/ProcessingStatus.tsx` | ~80 | "집계 진행 중" UI |
| `src/components/voting/KeyManager.tsx` | ~150 | 키 관리/변경 UI |
| `src/contractV2.ts` | ~300 | V2 ABI (MACI + Poll + MP + Tally) |

**수정 파일**:

| 파일 | 변경 | 위험도 |
|------|------|:------:|
| `src/components/QuadraticVotingDemo.tsx` | V2 모드 분기, 4-Phase 변경 | 높음 |
| `src/zkproof.ts` | ECDH/EdDSA/DuplexSponge import | 높음 |
| `src/contract.ts` | V2 ABI/주소 추가 | 중 |
| `src/components/voting/PhaseIndicator.tsx` | V2 Phase (Voting/Merging/Processing/Finalized) | 낮음 |
| `src/components/voting/VoteResult.tsx` | tallyVerified 표시 | 낮음 |

**구현 체크리스트**:

- [ ] **`src/contractV2.ts`**
  - [ ] MACI ABI (signUp, deployPoll)
  - [ ] Poll ABI (publishMessage, merge 함수들, isVotingOpen)
  - [ ] MessageProcessor ABI
  - [ ] Tally ABI (tallyVotes, publishResults)
  - [ ] 배포 주소 (추후 업데이트)

- [ ] **`VoteFormV2.tsx`** (Design 9.3 참조)
  - [ ] 투표 선택 UI (D1: 3옵션, D2: 2옵션)
  - [ ] BLAKE512 키 파생 → ECDH → DuplexSponge 암호화
  - [ ] Command binary packing (pollId 포함)
  - [ ] EdDSA 서명 (Poseidon)
  - [ ] `Poll.publishMessage()` 호출
  - [ ] nonce 관리 (localStorage)
  - [ ] **Reveal 관련 코드 없음** 확인

- [ ] **`MergingStatus.tsx`** (★ 신규 — AccQueue merge 대기)
  - [ ] Phase == Merging 시 표시
  - [ ] "AccQueue 병합 중입니다" 메시지
  - [ ] merge 진행률 표시 (stateAqMerged, messageAqMerged)

- [ ] **`ProcessingStatus.tsx`**
  - [ ] Phase == Processing 시 표시
  - [ ] "Coordinator가 집계 중입니다" 메시지
  - [ ] 예상 완료 시간

- [ ] **`KeyManager.tsx`**
  - [ ] 현재 EdDSA 키 표시 (공개키만)
  - [ ] "키 변경" 버튼 → BLAKE512로 새 키 파생 → publishMessage(keyChange)
  - [ ] 키 변경 확인 UI

- [ ] **`QuadraticVotingDemo.tsx` 수정**
  - [ ] V1/V2 모드 분기
  - [ ] Phase: Voting / Merging / Processing / Finalized (4단계)
  - [ ] RevealForm 렌더링 조건 제거

- [ ] **폐기 확인**
  - [ ] `RevealForm.tsx` — V2에서 import 없음
  - [ ] localStorage reveal 데이터 코드 — 제거/분기

**완료 기준**: 프론트엔드에서 V2 투표 전체 흐름 동작 (4-Phase)

---

### Step 8: Key Change 확장 (Anti-Coercion 완성)

**목표**: 투표 기간 중 키 변경으로 MACI 7대 보안 속성 전체 충족

**수정 파일**:

| 파일 | 변경 |
|------|------|
| `circuits/MessageProcessor.circom` | key change 분기 + 역순 처리 통합 |
| `coordinator/src/processing/processMessages.ts` | key change 처리 |
| `src/components/voting/KeyManager.tsx` | UI 완성 |

**구현 체크리스트**:

- [ ] **MessageProcessor 회로 확장**
  - [ ] `if (newPubKey != currentPubKey)` → 키 변경
  - [ ] 이전 키로 서명된 후속 메시지 → 역순 처리에서 자동 무효 → index 0
  - [ ] state leaf의 pubKey 업데이트

- [ ] **Coordinator 처리**
  - [ ] key change 감지 및 적용
  - [ ] 역순 처리에서 자연스럽게 이전 키 무효화
  - [ ] 투표 리셋 처리

- [ ] **MACI 7대 속성 시나리오 테스트** (Design 12.3):

| # | MACI 속성 | 시나리오 | 상태 |
|:-:|----------|---------|:----:|
| 1 | Collusion Resistance | 매수자가 투표 확인 시도 → DuplexSponge 불가 | [ ] |
| 2 | Receipt-freeness | 강압 투표 후 Key Change → 역순 처리 → 재투표 최종 | [ ] |
| 3 | Privacy | 온체인에 choice 평문 없음 | [ ] |
| 4 | Uncensorability | Coordinator 투표 누락 → AccQueue 포함 후 proof 실패 | [ ] |
| 5 | Unforgeability | 잘못된 EdDSA 서명 → index 0 라우팅 | [ ] |
| 6 | Non-repudiation | 동일 stateIndex 재투표 → 이전 투표 대체 | [ ] |
| 7 | Correct Execution | 잘못된 tally proof → revert | [ ] |

**완료 기준**: 7개 MACI 보안 속성 시나리오 테스트 전체 통과

---

## 4. 기존 코드 재사용 매핑

### 4.1 직접 재사용 (변경 없음)

| 기존 파일 | V2에서의 역할 |
|-----------|-------------|
| `contracts/PoseidonT5.sol` | State leaf 해싱 (4-input) |
| `contracts/Groth16Verifier.sol` | 투표 자격 검증 (signUp 시) |
| `circuits/PrivateVoting.circom` → `SecretToPublic` | 키 소유권 증명 |
| `src/workers/proofWorkerHelper.ts` | Web Worker 증명 생성 |
| `src/workers/zkProofWorker.ts` | Web Worker |

### 4.2 수정하여 재사용

| 기존 파일 | 변경 사항 |
|-----------|----------|
| `src/zkproof.ts` | ECDH/EdDSA/DuplexSponge import, `generateVoteProofV2()` 추가 |
| `src/contract.ts` | V2 ABI/주소 export 추가 |
| `src/hooks/useVotingMachine.ts` | V2 4-Phase 상태 머신 분기 |
| `circuits/PrivateVoting.circom` → `MerkleProof` | **QuinaryMerkleProof로 대체** |

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
| PoseidonT3/T6 온체인 없음 | AccQueue 빌드 불가 | `poseidon-solidity` 패키지 또는 MACI 소스 참조 |
| AccQueue 가스 비용 높음 | merge 트랜잭션 실패 | 점진적 merge (numSrQueueOps 조절) |
| MessageProcessor 회로 너무 큼 | 증명 시간 수십 분 | batchSize 줄이기 (5→1), 서버사이드 증명 |
| DuplexSponge circom 복잡 | 구현 난이도 높음 | MACI의 circom-ecdsa 또는 zk-kit circom 참조 |
| Trusted Setup 필요 | 보안 신뢰 | Powers of Tau ceremony 재사용 |
| Coordinator 단일 장애점 | 집계 지연 | processDeadline + backup coordinator |
| V1↔V2 병행 시 상태 혼란 | 사용자 혼란 | V2 전용 UI, V1은 읽기 전용 |

---

## 7. 브랜치 전략

```
main
  └── feature/maci-v2-core
        ├── feature/maci-crypto          (Step 1: ECDH, DuplexSponge, EdDSA, BLAKE512)
        ├── feature/maci-accqueue        (Step 2: AccQueue, PoseidonT3/T6)
        ├── feature/maci-contracts-v2    (Step 3: MACI.sol, Poll.sol, MP.sol, Tally.sol)
        ├── feature/maci-circuits-v2     (Step 4, 5: MessageProcessor, TallyVotes)
        ├── feature/maci-coordinator     (Step 6: 역순 처리, AccQueue merge)
        ├── feature/maci-frontend-v2     (Step 7: 4-Phase UI)
        └── feature/maci-key-change      (Step 8: Anti-Coercion)
```

**권장**: Step 1~3 완료 후 중간 PR → 리뷰 → Step 4~8 진행

---

## 8. 실행 명령어 참조

```bash
# Step 1: Crypto 모듈 테스트
npm install @noble/hashes  # BLAKE512 의존성
npx vitest run src/crypto/

# Step 2: AccQueue 테스트
forge test --match-contract AccQueueTest -vvv

# Step 3: V2 컨트랙트 테스트
forge test --match-contract MACITest -vvv
forge test --match-contract PollTest -vvv
forge test --match-contract MessageProcessorTest -vvv
forge test --match-contract TallyTest -vvv

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
| 2026-02-13 | AI | MACI 100% 반영 업데이트: DuplexSponge, BLAKE512, AccQueue+Quinary, MACI 분리 컨트랙트, 역순 처리, index 0 라우팅, SHA256, Ballot Tree, tally commitment 3-input, 4-Phase UI |
