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

### 0.2 MACI의 핵심 해법 요약

| 메커니즘 | 설명 | 해결하는 취약점 |
|----------|------|----------------|
| **암호화 투표** | ECDH로 Coordinator 공개키에 암호화. 평문 공개 없음 | 취약점 1 |
| **Key Change** | 투표 기간 중 EdDSA 키쌍 변경 가능. 이전 투표 무효화 | 취약점 2 |
| **메시지 갱신** | Nonce 기반, 마지막 유효 메시지가 최종 투표 | 취약점 3 |
| **Coordinator + ZKP** | 오프체인 집계 + 온체인 정확성 검증 | 취약점 1, 2 |

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

**신규 컨트랙트 구조**:

```
contracts/
├── PrivateVotingV2.sol          # 메인 컨트랙트 (V2)
│   ├── signUp()                 # 유권자 등록 (EdDSA pubkey)
│   ├── publishMessage()         # 암호화 투표 제출
│   ├── processMessages()        # Coordinator: state transition 증명 검증
│   ├── tallyVotes()             # Coordinator: tally 증명 검증
│   └── verifyTally()            # 결과 조회
│
├── MessageTree.sol              # 메시지 머클 트리
├── StateTree.sol                # 유저 상태 머클 트리
├── MessageProcessorVerifier.sol # State transition ZK 검증기
├── TallyVerifier.sol            # Tally ZK 검증기
├── Groth16Verifier.sol          # 기존 투표 자격 검증기 (유지)
└── PoseidonT5.sol               # 해시 함수 (유지)
```

#### 3.1.2 ZK 회로 신규/변경

| 회로 | 목적 | 복잡도 |
|------|------|--------|
| `MessageProcessor.circom` | 메시지 복호화 + State transition 검증 | 높음 |
| `TallyVotes.circom` | 집계 정확성 증명 | 중간 |
| `PrivateVoting.circom` | 기존 투표 자격 회로 (유지, 일부 수정) | 낮음 |

**MessageProcessor 회로의 핵심 검증**:
1. 메시지 복호화 정확성 (ECDH shared key)
2. 서명 유효성 (EdDSA)
3. Nonce 순서 검증
4. State leaf 업데이트 정확성
5. Key change 시 이전 state 무효화

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

**Coordinator 워크플로우**:
```
1. 투표 종료 감지 (블록 타임스탬프)
2. Message Tree에서 모든 메시지 읽기
3. 각 메시지 ECDH 복호화
4. State transition 순차 처리 (키 변경 포함)
5. processMessages proof 생성 (배치)
6. 온체인 processMessages() 호출
7. Tally 계산
8. tallyVotes proof 생성
9. 온체인 tallyVotes() 호출
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

#### 3.2.2 State Tree 구조

```
State Tree Leaf:
{
  pubKeyX: uint256,      // 현재 공개키 X
  pubKeyY: uint256,      // 현재 공개키 Y
  voteOptionRoot: uint256, // 투표 옵션 트리 루트
  voiceCreditBalance: uint256, // 남은 voice credit
  nonce: uint256          // 메시지 순서 (replay 방지)
}
```

#### 3.2.3 메시지 구조

```
Message (암호화 전):
{
  stateIndex: uint256,    // State Tree에서의 위치
  newPubKeyX: uint256,    // 새 공개키 (키 변경 시)
  newPubKeyY: uint256,
  voteOptionIndex: uint256, // 투표 대상 (proposalId)
  voteWeight: uint256,    // 투표 가중치
  nonce: uint256,         // 순서 번호
  salt: uint256           // 랜덤값
}

→ EdDSA 서명 → ECDH 암호화(Coordinator pubkey) → 온체인 제출
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

### 4.1 암호화 스택

| 구성요소 | 현재 | 목표 |
|----------|------|------|
| 해시 | Poseidon (PoseidonT5) | Poseidon (유지) |
| 서명 | 없음 (ZKP로 대체) | EdDSA (EdDSA-MiMCSponge 또는 EdDSA-Poseidon) |
| 암호화 | 없음 | ECDH + Poseidon 암호화 |
| 키 | Baby Jubjub | Baby Jubjub (유지, EdDSA와 동일 곡선) |
| ZKP | Groth16 (snarkjs) | Groth16 (유지) |
| Merkle Tree | 20-level (투표 자격) | 20-level State Tree + Message Tree |

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

### 4.3 Coordinator Trust Model

```
Coordinator CAN:
  ✅ 개별 투표 내용 확인 (복호화 가능)
  ✅ 집계 수행

Coordinator CANNOT:
  ❌ 투표 위조 (EdDSA 서명 필요)
  ❌ 투표 검열 (Message Tree에 이미 기록)
  ❌ 잘못된 집계 (ZKP가 온체인에서 검증)
  ❌ 투표 삭제 (블록체인 불변성)

Trust Assumption:
  - Coordinator가 개별 투표를 유출하지 않을 것을 신뢰
  - 단, 유출해도 Key Change로 인해 최종 투표 확인 불가
```

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

### 8.1 보안 기준 (MACI Parity)

| 속성 | 기준 | 검증 방법 |
|------|------|----------|
| **개별 투표 비공개** | Reveal phase 없음. 온체인에 choice 평문 없음 | 컨트랙트 ABI에 reveal 함수 부재 확인 |
| **Receipt-freeness** | 투표자가 투표 증명 불가 | Key Change 후 이전 투표 무효 시나리오 테스트 |
| **집계 정확성** | ZKP가 온체인에서 tally 검증 | Forge 테스트: 잘못된 tally proof revert |
| **검열 저항** | Coordinator가 투표 누락 불가 | Message Tree 포함 후 미처리 시 proof 실패 |
| **위조 방지** | 유효한 EdDSA 서명만 처리 | 잘못된 서명 메시지 무시 검증 |

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
