# Plan: MACI Anti-Collusion Infrastructure 적용

> **Feature**: maci-anti-collusion
> **Phase**: Plan
> **Created**: 2026-02-13
> **Status**: DRAFT
> **Reference**: [MACI (Minimal Anti-Collusion Infrastructure)](https://maci.pse.dev/)

---

## 0. 배경 및 동기

### 0.1 현재 시스템의 구조적 한계

현재 `zk-dex-d1-private-voting`은 **Commit-Reveal** 패턴을 사용한다. MACI와 비교 분석 결과, 아래 3가지 근본적 취약점이 확인되었다.

#### 취약점 1: Reveal Phase에서 투표 평문 노출

```
현재: revealVote(proposalId, nullifier, choice, voteSalt)
      → choice가 0/1/2 평문으로 온체인 기록
      → VoteRevealed 이벤트로 전세계 공개
      → Etherscan에서 개별 투표 확인 가능
```

- **영향**: Reveal 이후 "누가 어떻게 투표했는지" 완전 공개
- **파일**: `PrivateVoting.sol:345-377`, `ZkVotingFinal.sol` revealVoteD1/D2
- **MACI 해법**: 개별 투표를 **절대 공개하지 않음**. Coordinator만 복호화, 집계 결과(tally)만 공개

#### 취약점 2: Receipt-freeness 미충족 (매수/강압 방어 불가)

```
현재: 투표자가 매수자에게 nullifier + choice + voteSalt 제공
      → commitment 검증 가능 = 투표 증명 가능
      → Reveal 트랜잭션 자체가 "투표 영수증" 역할
      → 매수자가 "reveal 시 옆에서 확인" 가능
```

- **영향**: Anti-Coercion 주장과 달리 **실질적 강압 방어 불가**
- **MACI 해법**: Key Change 메커니즘으로 plausible deniability 확보

#### 취약점 3: Commit 후 투표 변경 불가

```
현재: nullifierUsed[proposalId][nullifier] = true (1회성)
      → 강압 상태에서 투표 후 되돌릴 수 없음
      → 투표자 자율성 보장 실패
```

- **영향**: 강압당해 투표하면 영구 확정
- **MACI 해법**: 마지막 유효 메시지 = 최종 투표. Nonce 기반으로 언제든 갱신 가능

### 0.2 MACI의 7대 보안 속성

MACI 공식 문서(https://maci.pse.dev/docs/introduction)에서 정의하는 보안 보장:

| # | 속성 | 설명 | 현재 시스템 충족 |
|:-:|------|------|:---------------:|
| 1 | **Collusion Resistance** | Coordinator만 투표 유효성 검증 가능, 매수자는 불가 | ❌ (Reveal로 검증 가능) |
| 2 | **Receipt-freeness** | 투표자가 제3자에게 투표를 증명 불가 (Coordinator 제외) | ❌ (Reveal이 영수증) |
| 3 | **Privacy** | Coordinator만 개별 투표 복호화 가능, 공개되는 것은 집계 결과만 | ❌ (Reveal 후 전체 공개) |
| 4 | **Uncensorability** | Coordinator도 유효 투표를 검열/삭제 불가 — 불변 온체인 큐 | ⚠️ (Nullifier 기반, 부분 충족) |
| 5 | **Unforgeability** | 개인키 보유자만 유효 투표 가능 (EdDSA 서명) | ✅ (ZKP로 충족) |
| 6 | **Non-repudiation** | 투표 삭제 불가, 새 투표로 덮어쓰기만 가능 | ❌ (1회성 nullifier) |
| 7 | **Correct Execution** | Coordinator의 잘못된 집계를 zk-SNARK가 방지 | ❌ (온체인 직접 집계) |

### 0.3 MACI의 핵심 메커니즘 요약

| 메커니즘 | 설명 | 해결하는 취약점 |
|----------|------|----------------|
| **암호화 투표** | ECDH로 Coordinator 공개키에 암호화. 평문 공개 없음 | 취약점 1 |
| **Key Change** | 투표 기간 중 EdDSA 키쌍 변경 가능. 이전 투표 무효화 | 취약점 2 |
| **역순 메시지 처리** | 메시지를 **마지막→처음 역순**으로 처리. Key Change 방어의 핵심 | 취약점 2 |
| **메시지 갱신** | Nonce 기반, 마지막 유효 메시지가 최종 투표 | 취약점 3 |
| **무효 메시지 → index 0** | 무효 command를 blank leaf(index 0)로 라우팅 (DoS 방지, 회로 내 증명) | 취약점 2 |
| **Coordinator + ZKP** | 오프체인 집계 + 온체인 정확성 검증 | 취약점 1, 2 |

#### 역순 메시지 처리가 핵심인 이유

```
MACI 원본 동작 (역순 = 마지막 메시지부터 처리):

메시지 순서: [msg1: Alice 찬성] → [msg2: Key Change pk1→pk2] → [msg3: Alice 반대(pk2)]

역순 처리:
  1. msg3 처리 (Alice, pk2로 반대) → State 반영 ✅
  2. msg2 처리 (Key Change) → pk1→pk2 변경, 이전 pk1 투표 무효화
  3. msg1 처리 (Alice, pk1로 찬성) → 이미 pk2로 변경됨, pk1 서명 무효 → index 0으로 라우팅

결과: Alice의 최종 투표 = 반대 (msg3)
Bob이 pk1 알아도 msg3은 복호화 불가 → 매수 실패

정순 처리 시 문제:
  1. msg1 처리 (Alice 찬성) → State 반영
  2. msg2 처리 (Key Change) → pk1→pk2
  3. msg3 처리 (Alice 반대) → 덮어쓰기
  → 정순이면 Bob이 msg1 시점의 state를 확인 가능 → 방어 약화
```

---

## 1. 목표

### 1.1 1차 목표 (Core Anti-Collusion)

MACI의 핵심 원리를 현재 시스템에 적용하여 **Reveal phase를 제거**하고, **개별 투표의 영구 비공개**를 달성한다.

### 1.2 2차 목표 (Full MACI Parity)

Key Change 메커니즘과 메시지 갱신을 구현하여 **완전한 Anti-Coercion**을 달성한다.

### 1.3 비목표 (Non-Goals)

- MACI 코드의 직접 포크/복사 (라이선스 및 의존성 복잡도)
- 기존 D1/D2 스펙의 완전 폐기 (점진적 마이그레이션)
- Coordinator의 투표 검열 가능성 허용 (ZKP로 방지)

---

## 2. 아키텍처 비교: 현재 vs 목표

### 2.1 현재 아키텍처 (Commit-Reveal)

```
[투표자] → commitVote(commitment, nullifier, zkProof) → [Smart Contract]
                                                            ↓ 저장
[투표자] → revealVote(choice, voteSalt) → [Smart Contract] → choice 평문 공개
                                                            ↓ 집계
                                                        [온체인 tally]
```

**프라이버시 타임라인**:
```
Commit Phase     Reveal Phase     Ended
[비공개 ●●●●] → [공개 ○○○○○] → [영구 공개]
                  ↑ 여기서 깨짐
```

### 2.2 목표 아키텍처 (MACI-Inspired)

```
[투표자] → publishMessage(encryptedVote) → [Smart Contract: Message Tree]
                                                ↓
                                           투표 종료
                                                ↓
[Coordinator] → 메시지 복호화 → State 전이 처리 → Tally 계산
                                                ↓
[Coordinator] → processMessages(batchProof) → [Smart Contract: 검증]
[Coordinator] → tallyVotes(tallyProof)     → [Smart Contract: 결과 등록]
```

**프라이버시 타임라인**:
```
Voting Phase      Processing       Result
[비공개 ●●●●] → [비공개 ●●●●] → [집계만 공개, 개별 영구 비공개]
```

---

## 3. 구현 범위 및 단계

### Phase 1: 암호화 메시지 + Coordinator (Reveal 제거)

**목표**: Reveal phase 완전 제거. 암호화 투표 → 오프체인 집계 → ZKP 검증

#### 3.1.1 스마트 컨트랙트 변경

| 항목 | 현재 | 변경 |
|------|------|------|
| 투표 함수 | `commitVote()` + `revealVote()` | `publishMessage(encMsg)` 단일 함수 |
| 데이터 구조 | commitment mapping | Message Tree (Merkle Tree) |
| 집계 | 온체인 (reveal 시) | 오프체인 Coordinator + ZKP 검증 |
| Phase | Commit → Reveal → Ended | Voting → Processing → Finalized |
| 검증 | Groth16Verifier (투표 자격) | + MessageProcessor Verifier + Tally Verifier |

**신규 컨트랙트 구조 (MACI 분리 패턴 적용)**:

```
contracts/
├── MACI.sol                     # 등록 전용 (signUp + SignUpGatekeeper)
│   ├── signUp()                 # 유권자 등록 (EdDSA pubkey)
│   ├── deployPoll()             # 투표 인스턴스 생성
│   └── stateAq                  # State AccQueue
│
├── Poll.sol                     # 투표 전용 (publishMessage)
│   ├── publishMessage()         # 암호화 투표 제출
│   ├── mergeMaciStateAq*()      # AccQueue merge 함수들
│   └── messageAq                # Message AccQueue
│
├── MessageProcessor.sol         # State transition 검증
│   └── processMessages()        # Coordinator: batch proof 검증
│
├── Tally.sol                    # 집계 검증
│   └── tallyVotes()             # Coordinator: tally proof 검증
│
├── AccQueue.sol                 # Quinary AccQueue (enqueue/merge)
├── VkRegistry.sol               # 검증키 레지스트리
│
├── gatekeepers/
│   ├── ISignUpGatekeeper.sol    # 등록 제한 인터페이스
│   └── FreeForAllGatekeeper.sol # 제한 없는 기본 구현
│
├── voiceCreditProxy/
│   ├── IVoiceCreditProxy.sol    # Voice credit 할당 인터페이스
│   └── ConstantVoiceCreditProxy.sol # 고정 할당
│
├── Verifier.sol                 # Groth16 검증기 (자동 생성)
├── PoseidonT3.sol               # 2-input Poseidon (머클 트리)
├── PoseidonT5.sol               # 4-input Poseidon (기존 유지)
├── PoseidonT6.sol               # 5-input Poseidon (State leaf)
├── Groth16Verifier.sol          # 기존 투표 자격 검증기 (유지)
└── DomainObjs.sol               # 공유 도메인 객체 정의
```

**MACI 원본 대비 간소화**: PollFactory, MessageProcessorFactory, TallyFactory, SubsidyFactory는 단일 배포 환경이므로 생략. TopupCredit도 초기 버전에서 제외.

#### 3.1.2 ZK 회로 신규/변경

| 회로 | 목적 | 복잡도 |
|------|------|--------|
| `MessageProcessor.circom` | 메시지 복호화 + State transition 검증 | 높음 |
| `TallyVotes.circom` | 집계 정확성 증명 | 중간 |
| `PrivateVoting.circom` | 기존 투표 자격 회로 (유지, 일부 수정) | 낮음 |

**MessageProcessor 회로의 핵심 검증** (MACI 완전 반영):
1. 메시지 복호화 정확성 (ECDH shared key → Poseidon DuplexSponge)
2. 서명 유효성 (EdDSA-Poseidon)
3. Nonce 순서 검증
4. State leaf 업데이트 정확성
5. Key change 시 이전 state 무효화
6. **역순 처리 (Reverse Processing)** — 마지막 메시지부터 처리 (Key Change 방어 핵심)
7. **무효 메시지 → index 0 라우팅** — 무효 command를 blank leaf로 전달 (DoS 방지)
8. Voice credit 충분성: `balance + (기존 weight)² - (새 weight)² >= 0`
9. Vote weight < sqrt(p) 범위 검증
10. State index, Timestamp, Vote option 유효성 검증

#### 3.1.3 Coordinator 서비스

```
coordinator/
├── src/
│   ├── index.ts                 # 메인 엔트리
│   ├── decrypt.ts               # ECDH 메시지 복호화
│   ├── processMessages.ts       # State transition 순차 처리
│   ├── tally.ts                 # 투표 집계
│   ├── proofGenerator.ts        # ZKP 생성 (snarkjs)
│   └── onchain.ts               # 컨트랙트 호출 (ethers.js)
├── package.json
└── tsconfig.json
```

**Coordinator 워크플로우** (MACI 정렬):
```
1. 투표 종료 감지 (블록 타임스탬프)
2. AccQueue merge 실행 (mergeSubRoots → merge)
3. Message Tree에서 모든 메시지 읽기
4. ★ 역순(마지막→처음)으로 배치 처리:
   a. ECDH 복호화 (Poseidon DuplexSponge)
   b. EdDSA 서명 검증
   c. 유효: State transition 적용
   d. 무효: blank leaf (index 0)로 라우팅 (회로 증명)
5. 배치별 processMessages ZKP 생성
6. 온체인 processMessages() 호출 (배치 반복)
7. 최종 State Tree에서 Tally 계산 (배치)
8. 배치별 tallyVotes ZKP 생성
9. 온체인 tallyVotes() 호출 (배치 반복)
10. 결과 공개
```

#### 3.1.4 프론트엔드 변경

| 항목 | 현재 | 변경 |
|------|------|------|
| 투표 흐름 | Commit → 기다림 → Reveal | Vote(암호화 전송) → 결과 대기 |
| Phase UI | 3단계 (Commit/Reveal/Ended) | 3단계 (Voting/Processing/Finalized) |
| Reveal UI | `RevealForm.tsx` | **삭제** (더 이상 필요 없음) |
| 키 관리 | Baby Jubjub (localStorage) | EdDSA 키쌍 + Coordinator pubkey |
| 암호화 | 없음 (hash만) | ECDH 암호화 |

### Phase 2: Key Change 메커니즘 (Anti-Coercion 완성)

**목표**: 투표 기간 중 키 변경으로 매수/강압 완전 방어

#### 3.2.1 Key Change 흐름

```
1. 투표자 Alice: 키쌍 (sk1, pk1)으로 등록
2. 매수자 Bob: "찬성에 투표하라" 강압
3. Alice: pk1으로 찬성 투표 (매수자 앞에서)
4. Alice: 새 키쌍 (sk2, pk2) 생성
5. Alice: Key Change 메시지 전송 (sk1로 서명, pk2를 새 키로 등록)
6. Alice: pk2로 반대 투표 (혼자)
7. Coordinator 처리: 3번 투표 무효, 6번 투표 유효
8. Bob: 암호화되어 있어 5~6번 과정 확인 불가
```

#### 3.2.2 State Leaf 구조 (MACI 정렬)

```
MACI 원본 State Leaf:
  poseidon_4([pubKeyX, pubKeyY, voiceCreditBalance, timestamp])

우리 적용 State Leaf:
  poseidon_4([pubKeyX, pubKeyY, voiceCreditBalance, timestamp])
  ※ MACI와 동일한 4-input 구조 적용

Ballot (별도 도메인 객체, MACI 원본 반영):
  blt_v[i] = 각 vote option에 할당한 weight
  blt_n = nonce (0부터 시작, 첫 유효 command nonce = 1)
  blt_r = Merkle root of vote weights (quinary tree)
  hash = poseidon_2([blt_n, blt_r])
  ※ State Leaf에 voteOptionRoot를 넣지 않고 Ballot로 분리

Blank State Leaf (index 0):
  MACI에서 정의한 고정값 (Pedersen generator 기반)
  → 무효 메시지가 라우팅되는 대상
```

#### 3.2.3 Command & Message 구조 (MACI 정렬)

```
Command (binary-packed, MACI 원본):
{
  stateIndex: 50 bits,        // State Tree 위치
  newPubKeyX: 253 bits,       // 새 공개키 X (키 변경 시)
  newPubKeyY: 253 bits,       // 새 공개키 Y
  voteOptionIndex: 50 bits,   // 투표 대상
  newVoteWeight: 50 bits,     // 투표 가중치
  nonce: 50 bits,             // 순서 번호 (currentNonce + 1)
  pollId: 50 bits,            // Poll 식별자
  salt: 253 bits              // 랜덤값
}

Command Hash = poseidon_4([packedValue, pubKeyX, pubKeyY, salt])

Message (암호화된 Command + Signature):
  plaintext = packed command + EdDSA signature (R8[0], R8[1], S)
  → Poseidon DuplexSponge 암호화(ECDH shared key)
  → [encMessage[], encPubKey] 온체인 제출
```

### Phase 3: D2 Quadratic Voting 통합

**목표**: MACI 아키텍처 위에 기존 D2 Quadratic Voting 로직 병합

| 항목 | 변경 |
|------|------|
| Voice Credit | Quadratic cost 적용 (numVotes² credit 소비) |
| TON 토큰 연동 | approveAndCall → publishMessage 통합 |
| Tally 회로 | √(creditsSpent) = tallied votes |

---

## 4. 기술 스펙

### 4.1 암호화 스택 (MACI 완전 매핑)

| 구성요소 | MACI 원본 | 우리 적용 | 차이 사유 |
|----------|-----------|----------|----------|
| 곡선 | Baby Jubjub | Baby Jubjub (동일) | — |
| 해시 | Poseidon (T3/T4/T5/T6) | Poseidon (T3 추가, T5 유지) | T6는 불필요 |
| 서명 | EdDSA-Poseidon | EdDSA-Poseidon (동일) | — |
| 대칭 암호화 | **Poseidon DuplexSponge** | **Poseidon DuplexSponge** (MACI 동일) | CTR→Sponge 변경 |
| 키 교환 | ECDH (Baby Jubjub) | ECDH (동일) | — |
| 키 파생 | **BLAKE512 → prune → scalar** | **BLAKE512** (MACI 동일) | 추가 필요 |
| Public input 압축 | **SHA256** | **SHA256** (MACI 동일) | 가스 최적화 |
| ZKP | Groth16 (rapidsnark) | Groth16 (snarkjs) | 프로버만 다름 |
| Merkle Tree | **Quinary (arity 5)** | **Quinary (arity 5)** (MACI 동일) | Binary→Quinary 변경 |
| 트리 관리 | **AccQueue** (enqueue/merge) | **AccQueue** (MACI 동일) | IMT→AccQueue 변경 |
| 키 직렬화 | `macisk.`/`macipk.` 접두사 | 자체 포맷 | 호환 불필요 |

**기존 Plan 대비 변경점**:
1. 암호화: CTR 모드 → **Poseidon DuplexSponge** (MACI의 zk-kit 패키지 사용)
2. 키 파생: 단순 random → **BLAKE512 해싱 + pruning** (RFC 8032 스타일)
3. Merkle Tree: Binary → **Quinary (5-ary)** (Poseidon(5)에 최적화, 깊이 감소)
4. 트리 관리: IncrementalMerkleTree → **AccQueue** (온체인 누적 큐 패턴)
5. SHA256: 회로 public input을 SHA256으로 압축하여 온체인 검증 가스 절감

### 4.2 컨트랙트 인터페이스 (V2)

```solidity
interface IPrivateVotingV2 {
    // === 등록 ===
    function signUp(
        uint256 _pubKeyX,
        uint256 _pubKeyY,
        bytes memory _signUpGatekeeperData,
        bytes memory _initialVoiceCreditProxyData
    ) external;

    // === 투표 (암호화 메시지 제출) ===
    function publishMessage(
        uint256[7] calldata _message,  // 암호화된 메시지
        uint256[2] calldata _encPubKey // 임시 공개키 (ECDH)
    ) external;

    // === Coordinator: State Transition 검증 ===
    function processMessages(
        uint256 _newStateRoot,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[] calldata _pubSignals
    ) external;

    // === Coordinator: Tally 검증 ===
    function tallyVotes(
        uint256 _newTallyCommitment,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[] calldata _pubSignals
    ) external;

    // === 결과 조회 ===
    function verifyTally(
        uint256 _proposalId,
        uint256 _tallyResult,
        uint256[][] calldata _tallyProof
    ) external view returns (bool);
}
```

### 4.3 Coordinator Trust Model (MACI 완전 반영)

```
Coordinator CAN:
  ✅ 개별 투표 내용 확인 (복호화 가능)
  ✅ 집계 수행
  ✅ 투표 라운드 지연/중단

Coordinator CANNOT:
  ❌ 투표 위조 (EdDSA 서명 필요 — Unforgeability)
  ❌ 투표 검열 (불변 온체인 AccQueue — Uncensorability)
  ❌ 잘못된 집계 (zk-SNARK 온체인 검증 — Correct Execution)
  ❌ 투표 삭제 (새 투표로만 덮어쓰기 — Non-repudiation)

Trust Assumption:
  - Coordinator가 개별 투표를 유출하지 않을 것을 신뢰
  - 단, 유출해도 Key Change + 역순 처리로 최종 투표 확인 불가
```

### 4.4 MACI 기능 전수 채택 매트릭스

모든 MACI 공식 기능에 대한 채택/제외 결정:

#### 암호화 & 키 관리

| MACI 기능 | 채택 | 사유 |
|-----------|:----:|------|
| Baby Jubjub 곡선 | ✅ 채택 | 기존 동일 |
| Poseidon 해시 (T3/T4/T5/T6) | ✅ 채택 | T3, T6 추가 필요 |
| EdDSA-Poseidon 서명 | ✅ 채택 | 신규 |
| Poseidon DuplexSponge 암호화 | ✅ 채택 | zk-kit 패키지 사용 |
| ECDH 키 교환 | ✅ 채택 | 신규 |
| BLAKE512 키 파생 | ✅ 채택 | RFC 8032 스타일 |
| SHA256 public input 압축 | ✅ 채택 | 가스 최적화 |
| Key Change 메커니즘 | ✅ 채택 | Anti-Coercion 핵심 |
| Key 직렬화 (`macisk.`/`macipk.`) | ❌ 제외 | MACI 호환 불필요, 자체 포맷 |

#### 데이터 구조

| MACI 기능 | 채택 | 사유 |
|-----------|:----:|------|
| Quinary Merkle Tree (5-ary) | ✅ 채택 | Poseidon(5)에 최적 |
| AccQueue (누적 큐) | ✅ 채택 | 온체인 트리 관리 |
| State Leaf (4-input) | ✅ 채택 | MACI 정렬 |
| Ballot (별도 도메인 객체) | ✅ 채택 | MACI 정렬 |
| Command binary packing | ✅ 채택 | 회로 효율성 |
| Blank State Leaf (index 0) | ✅ 채택 | 무효 메시지 처리 필수 |
| LazyIMT | ⚠️ 검토 | AccQueue가 우선, 필요 시 추가 |
| LeanIMT | ❌ 제외 | AccQueue로 대체 |

#### 스마트 컨트랙트

| MACI 기능 | 채택 | 사유 |
|-----------|:----:|------|
| MACI.sol + Poll.sol 분리 | ✅ 채택 | 관심사 분리 |
| MessageProcessor.sol | ✅ 채택 | 핵심 |
| Tally.sol | ✅ 채택 | 핵심 |
| TallyNonQv.sol | ✅ 채택 | D1 = Non-QV 모드 |
| VkRegistry | ✅ 채택 | 검증키 관리 |
| SignUpGatekeeper (인터페이스) | ✅ 채택 | 모듈형 등록 |
| FreeForAllGatekeeper | ✅ 채택 | 기본 구현 |
| IVoiceCreditProxy | ✅ 채택 | 모듈형 credit 할당 |
| ConstantVoiceCreditProxy | ✅ 채택 | 기본 구현 |
| PollFactory 등 Factory 패턴 | ❌ 제외 | 단일 배포, 불필요 |
| TopupCredit | ❌ 제외 | 초기 버전 불필요 |
| Subsidy/SubsidyFactory | ❌ 제외 | 범위 외 |
| SignUpToken (ERC721) | ❌ 제외 | TON 토큰으로 대체 |
| EASGatekeeper, HatsGatekeeper | ❌ 제외 | 범위 외, 향후 확장 |

#### ZK 회로

| MACI 기능 | 채택 | 사유 |
|-----------|:----:|------|
| MessageProcessor circuit | ✅ 채택 | 핵심 |
| 역순 메시지 처리 | ✅ 채택 | Key Change 방어 핵심 |
| 무효 메시지 → index 0 | ✅ 채택 | 회로 내 DoS 방지 |
| TallyVotes circuit (QV) | ✅ 채택 | D2 모드 |
| TallyNonQv circuit | ✅ 채택 | D1 모드 |
| Poll Joining circuit | ⚠️ Phase 3 | 초기에는 signUp으로 대체 |
| Tally commitment (3-input) | ✅ 채택 | `poseidon_3([votes_root, total_spent, per_option_spent])` |

#### Coordinator & 인프라

| MACI 기능 | 채택 | 사유 |
|-----------|:----:|------|
| Coordinator 오프체인 처리 | ✅ 채택 | 핵심 |
| Coordinator REST Service | ⚠️ Phase 2 | 초기에는 CLI/스크립트 |
| Offchain Relayer (Gasless) | ❌ 제외 | 범위 외, 향후 확장 |
| SubGraph 통합 | ❌ 제외 | 이벤트 직접 수신으로 대체 |

#### 투표 모드

| MACI 기능 | 채택 | 사유 |
|-----------|:----:|------|
| Quadratic Voting (QV) | ✅ 채택 | D2 모드 |
| Non-Quadratic Voting | ✅ 채택 | D1 모드 |
| Full Credits Voting | ❌ 제외 | 범위 외 |

---

## 5. 기존 시스템과의 호환성

### 5.1 보존 항목

| 항목 | 파일 | 이유 |
|------|------|------|
| Baby Jubjub 키 | `zkproof.ts` | MACI도 동일 곡선 사용 |
| Poseidon 해시 | `PoseidonT5.sol` | MACI도 Poseidon 사용 |
| Groth16 검증 | `Groth16Verifier.sol` | ZKP 시스템 동일 |
| 토큰 노트 구조 | `zkproof.ts` | Merkle Tree 자격 검증 유지 |
| Web Worker | `workers/` | 증명 생성 오프로딩 유지 |

### 5.2 폐기 항목

| 항목 | 파일 | 이유 |
|------|------|------|
| `revealVote()` | `PrivateVoting.sol` | Reveal phase 자체가 제거됨 |
| `revealVoteD1/D2()` | `ZkVotingFinal.sol` | 동일 |
| `RevealForm.tsx` | `components/voting/` | Reveal UI 불필요 |
| `VoteRevealed` 이벤트 | Contracts | 개별 투표 공개 안 함 |
| localStorage 투표 저장 | `zkproof.ts` | Reveal용 데이터 불필요 |

### 5.3 마이그레이션 전략

```
V1 (현재)                      V2 (목표)
PrivateVoting.sol        →    PrivateVotingV2.sol (신규)
ZkVotingFinal.sol        →    유지 (하위 호환, deprecated)
Groth16Verifier.sol      →    유지 + MessageProcessorVerifier 추가
PrivateVoting.circom     →    수정 (commitment → encrypted message)
QuadraticVotingDemo.tsx  →    대폭 수정 (Reveal 제거, Phase 변경)
```

**병행 운영**: V1 컨트랙트는 기존 배포 유지. V2는 새 주소로 배포. 프론트엔드에서 V2 우선 사용.

---

## 6. 구현 순서 (우선순위)

### 6.1 Phase 1: Core (Reveal 제거 + 암호화 투표)

| # | 작업 | 산출물 | 의존성 | 복잡도 |
|:-:|------|--------|--------|:------:|
| 1-1 | ECDH 암호화 모듈 개발 | `src/crypto/ecdh.ts` | 없음 | 중 |
| 1-2 | Message Tree 컨트랙트 | `contracts/MessageTree.sol` | 없음 | 중 |
| 1-3 | State Tree 컨트랙트 | `contracts/StateTree.sol` | 없음 | 중 |
| 1-4 | PrivateVotingV2 컨트랙트 | `contracts/PrivateVotingV2.sol` | 1-2, 1-3 | 높음 |
| 1-5 | MessageProcessor 회로 | `circuits/MessageProcessor.circom` | 1-1 | 높음 |
| 1-6 | TallyVotes 회로 | `circuits/TallyVotes.circom` | 1-5 | 중 |
| 1-7 | Coordinator 서비스 | `coordinator/` | 1-4, 1-5, 1-6 | 높음 |
| 1-8 | 프론트엔드 V2 통합 | `src/components/` | 1-4, 1-7 | 중 |
| 1-9 | 컨트랙트 테스트 | `test/PrivateVotingV2.t.sol` | 1-4 | 중 |
| 1-10 | E2E 테스트 | `test/e2e/` | 전체 | 중 |

### 6.2 Phase 2: Key Change (Anti-Coercion 완성)

| # | 작업 | 산출물 | 의존성 | 복잡도 |
|:-:|------|--------|--------|:------:|
| 2-1 | Key Change 회로 로직 | `MessageProcessor.circom` 확장 | Phase 1 | 높음 |
| 2-2 | State Tree 키 업데이트 | `StateTree.sol` 확장 | Phase 1 | 중 |
| 2-3 | Coordinator 키 변경 처리 | `coordinator/processMessages.ts` | 2-1 | 중 |
| 2-4 | Key Change UI | `src/components/KeyManager.tsx` | 2-3 | 낮음 |
| 2-5 | 키 변경 시나리오 테스트 | `test/KeyChange.t.sol` | 2-1~2-3 | 중 |

### 6.3 Phase 3: D2 Quadratic 통합

| # | 작업 | 산출물 | 의존성 | 복잡도 |
|:-:|------|--------|--------|:------:|
| 3-1 | Quadratic cost 회로 통합 | `circuits/` 확장 | Phase 1 | 중 |
| 3-2 | TON 토큰 연동 | `PrivateVotingV2.sol` 확장 | 3-1 | 중 |
| 3-3 | Quadratic tally 로직 | `coordinator/tally.ts` 확장 | 3-1 | 낮음 |
| 3-4 | UI 통합 | 프론트엔드 | 3-1~3-3 | 낮음 |

---

## 7. 리스크 및 대응

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| Coordinator 단일 장애점 | 집계 지연/불가 | 중 | 타임아웃 후 대체 Coordinator 지정 메커니즘 |
| ZK 회로 복잡도 증가 | 증명 시간 폭증 | 높음 | 배치 증명, 회로 최적화, 서버사이드 증명 |
| Coordinator 프라이버시 유출 | 개별 투표 노출 | 낮음 | Key Change로 최종 투표 불확실성 유지 |
| 기존 V1 호환성 깨짐 | 사용자 혼란 | 중 | V1/V2 병행, 점진적 마이그레이션 |
| Trusted Setup 필요 | 보안 신뢰 | 중 | Powers of Tau ceremony 활용 |

---

## 8. 성공 기준

### 8.1 보안 기준 (MACI 7대 속성 전체 충족)

| # | MACI 속성 | 기준 | 검증 방법 |
|:-:|----------|------|----------|
| 1 | **Collusion Resistance** | Coordinator만 투표 검증 가능, 매수자 불가 | Key Change 시나리오 테스트 |
| 2 | **Receipt-freeness** | 투표자가 투표 증명 불가 | Key Change 후 이전 투표 무효 + 역순 처리 테스트 |
| 3 | **Privacy** | 온체인에 choice 평문 없음, Coordinator만 복호화 | ABI에 reveal 함수 부재 + 이벤트 검사 |
| 4 | **Uncensorability** | Coordinator가 투표 누락 불가 | AccQueue 포함 후 미처리 시 proof 실패 테스트 |
| 5 | **Unforgeability** | 유효한 EdDSA 서명만 처리 | 잘못된 서명 → index 0 라우팅 검증 |
| 6 | **Non-repudiation** | 투표 삭제 불가, 새 투표로만 덮어쓰기 | 동일 stateIndex 재투표 시 이전 투표 대체 검증 |
| 7 | **Correct Execution** | ZKP가 온체인에서 tally 검증 | 잘못된 tally proof → revert 테스트 |

### 8.2 기능 기준

| 항목 | 기준 |
|------|------|
| 투표 제출 | 암호화 메시지 온체인 기록 (Message Tree) |
| 집계 | Coordinator 오프체인 처리 + 온체인 ZKP 검증 |
| 키 변경 | 투표 기간 중 키 변경 후 재투표 성공 |
| 결과 | 집계 결과만 공개, 개별 투표 영구 비공개 |

### 8.3 성능 기준

| 항목 | 기준 |
|------|------|
| 투표 제출 | 가스비 현재 수준 이하 (reveal 제거로 총 가스 감소) |
| 증명 생성 (사용자) | 30초 이내 (현재와 동일) |
| Coordinator 처리 | 1000표 기준 10분 이내 |
| 온체인 검증 | processMessages + tallyVotes 각 50만 gas 이내 |

---

## 9. 파일 변경 예상

### 9.1 신규 생성

| 파일 | 목적 |
|------|------|
| `contracts/PrivateVotingV2.sol` | V2 메인 컨트랙트 |
| `contracts/MessageTree.sol` | 메시지 머클 트리 |
| `contracts/StateTree.sol` | 유저 상태 트리 |
| `contracts/MessageProcessorVerifier.sol` | State transition 검증기 |
| `contracts/TallyVerifier.sol` | Tally 검증기 |
| `circuits/MessageProcessor.circom` | 메시지 처리 회로 |
| `circuits/TallyVotes.circom` | 집계 회로 |
| `coordinator/` | Coordinator 서비스 전체 |
| `src/crypto/ecdh.ts` | ECDH 암호화 모듈 |
| `src/components/KeyManager.tsx` | 키 관리 UI |
| `test/PrivateVotingV2.t.sol` | V2 테스트 |

### 9.2 수정

| 파일 | 변경 내용 | 위험도 |
|------|----------|:------:|
| `src/components/QuadraticVotingDemo.tsx` | Phase 로직 변경, Reveal 제거 | 높음 |
| `src/zkproof.ts` | ECDH 암호화 추가, reveal 관련 코드 제거 | 높음 |
| `src/contract.ts` | V2 컨트랙트 ABI/주소 추가 | 중 |
| `circuits/PrivateVoting.circom` | commitment → encrypted message 적응 | 중 |

### 9.3 폐기 (V2 완성 후)

| 파일 | 이유 |
|------|------|
| `src/components/voting/RevealForm.tsx` | Reveal 불필요 |
| `revealVote*` 함수들 | V2에서 제거 |

---

## 10. 참고 자료

- [MACI Official](https://maci.pse.dev/)
- [MACI Introduction](https://maci.pse.dev/docs/introduction)
- [MACI Original Specification (HackMD)](https://hackmd.io/@OFccBlU5TNCiRhpIyT1m7g/SkXv-gO5r)
- [MACI GitHub (PSE)](https://github.com/privacy-scaling-explorations/maci)
- [D1 Private Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D2 Quadratic Voting Spec](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d2-quadratic.md)

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-13 | AI | MACI 분석 기반 초기 Plan 작성 |
