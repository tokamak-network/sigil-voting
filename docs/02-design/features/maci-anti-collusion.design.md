# Design: MACI Anti-Collusion Infrastructure 적용

> **Feature**: maci-anti-collusion
> **Phase**: Design
> **Created**: 2026-02-13
> **Status**: DRAFT
> **Plan Reference**: `docs/01-plan/features/maci-anti-collusion.plan.md`
> **Spec Reference**: `docs/specs/d1-private-voting.spec.md`, `docs/specs/d2-quadratic.spec.md`

---

## 1. 설계 원칙

### 1.1 스펙 준수 (절대)
- D1/D2 스펙의 **공개입력, 해시 수식, 선택지** 변경 금지
- MACI 원리를 적용하되, 기존 스펙의 암호학적 기본요소(Poseidon, Baby Jubjub, Groth16)를 유지
- D1 choice: {0, 1, 2}, D2 choice: {0, 1} — 변경 불가

### 1.2 Reveal 제거가 핵심
- `revealVote*()` 함수 완전 제거
- `VoteRevealed*` 이벤트 제거
- 개별 투표 choice는 **온체인에 평문으로 절대 기록되지 않음**
- 공개되는 것은 **집계 결과(forVotes, againstVotes)만**

### 1.3 V1과 V2 병행
- V1(`ZkVotingFinal.sol`)은 기존 배포 유지 (deprecated)
- V2(`PrivateVotingV2.sol`)는 새 주소로 배포
- 프론트엔드에서 V2 우선 사용, V1은 읽기 전용

---

## 2. 시스템 아키텍처

### 2.1 전체 흐름

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Registration                         │
│                                                                      │
│  [투표자] ──signUp(pubKeyX, pubKeyY)──> [PrivateVotingV2]            │
│                                         └─ State Tree에 leaf 추가    │
│                                         └─ stateIndex 발급           │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Voting                               │
│                                                                      │
│  [투표자]                                                             │
│    1. command = {stateIndex, newPubKey, voteOption, voteWeight, nonce}│
│    2. signature = EdDSA.sign(command, sk)                            │
│    3. sharedKey = ECDH(sk_ephemeral, coordinatorPubKey)              │
│    4. encMessage = encrypt(command + signature, sharedKey)            │
│    5. ──publishMessage(encMessage, encPubKey)──> [PrivateVotingV2]   │
│                                                  └─ Message Tree 추가 │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Processing                           │
│                                                                      │
│  [Coordinator]                                                       │
│    1. Message Tree 전체 메시지 읽기                                    │
│    2. 각 메시지 ECDH 복호화                                            │
│    3. EdDSA 서명 검증                                                  │
│    4. Nonce 순서 검증                                                  │
│    5. Key Change 적용 (있으면)                                         │
│    6. State Tree 업데이트                                              │
│    7. processMessages ZKP 생성 (배치)                                  │
│    8. ──processMessages(proof)──> [PrivateVotingV2] ← 온체인 검증     │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Tallying                             │
│                                                                      │
│  [Coordinator]                                                       │
│    1. 최종 State Tree에서 모든 유효 투표 집계                           │
│    2. D1: forVotes += votingPower, D2: forVotes += numVotes           │
│    3. tallyVotes ZKP 생성                                             │
│    4. ──tallyVotes(proof, results)──> [PrivateVotingV2] ← 검증+저장  │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Finalized                            │
│                                                                      │
│  [누구나] getResults(proposalId) → {forVotes, againstVotes}          │
│           개별 투표는 영구 비공개                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 정의 (V1 → V2 변경)

| V1 Phase | V2 Phase | 값 | 조건 | 허용 액션 |
|----------|----------|:--:|------|----------|
| Commit | **Voting** | 0 | `now <= endTime` | signUp, publishMessage |
| Reveal | **Processing** | 1 | `endTime < now <= processDeadline` | processMessages (Coordinator only) |
| Ended | **Finalized** | 2 | `now > processDeadline` 또는 tally 완료 | getResults (읽기만) |

---

## 3. 데이터 구조

### 3.1 State Tree Leaf

```
State Tree (20-level Merkle Tree)
├── Leaf 0: 빈 값 (reserved, MACI 규칙)
├── Leaf 1: 첫 번째 등록 유저
├── Leaf 2: 두 번째 등록 유저
└── ...

Leaf 구조:
┌─────────────────────────────────────────────┐
│  stateLeaf = Poseidon(                      │
│    pubKeyX,           // 현재 공개키 X       │
│    pubKeyY,           // 현재 공개키 Y       │
│    voteOptionRoot,    // 투표 옵션 트리 루트  │
│    voiceCreditBalance,// 남은 크레딧          │
│    nonce              // 메시지 순서          │
│  )                                          │
└─────────────────────────────────────────────┘
```

**TypeScript 타입**:
```typescript
interface StateLeaf {
  pubKeyX: bigint;
  pubKeyY: bigint;
  voteOptionRoot: bigint;   // Poseidon(voteOption[0], voteOption[1], ...)
  voiceCreditBalance: bigint;
  nonce: bigint;
}
```

### 3.2 Message 구조

```
Message (암호화 전 평문):
┌─────────────────────────────────────────────┐
│  command = {                                │
│    stateIndex: uint256,  // State Tree 위치  │
│    newPubKeyX: uint256,  // 키 변경 시 새 키  │
│    newPubKeyY: uint256,  // (변경 없으면 현재) │
│    voteOptionIndex: uint256, // proposalId   │
│    newVoteWeight: uint256,   // 투표 가중치   │
│    nonce: uint256,       // 순서 (1, 2, 3..) │
│    salt: uint256         // 랜덤값           │
│  }                                          │
│                                             │
│  signature = EdDSA.sign(hash(command), sk)  │
│                                             │
│  encMessage = PoseidonEncrypt(              │
│    command + signature,                     │
│    ECDH(ephemeralSk, coordinatorPk)         │
│  )                                          │
└─────────────────────────────────────────────┘
```

**TypeScript 타입**:
```typescript
interface Command {
  stateIndex: bigint;
  newPubKeyX: bigint;
  newPubKeyY: bigint;
  voteOptionIndex: bigint;  // proposalId
  newVoteWeight: bigint;    // D1: votingPower, D2: numVotes
  nonce: bigint;
  salt: bigint;
}

interface Message {
  data: bigint[];        // 암호화된 command + signature (7개 필드)
  encPubKeyX: bigint;    // 임시 공개키 X (ECDH용)
  encPubKeyY: bigint;    // 임시 공개키 Y
}
```

### 3.3 Message Tree

```
Message Tree (20-level Merkle Tree)
├── Leaf 0: 첫 번째 메시지 해시
├── Leaf 1: 두 번째 메시지 해시
└── ...

messageLeaf = Poseidon(
  encMessage[0], encMessage[1], ..., encMessage[6],
  encPubKeyX, encPubKeyY
)
```

### 3.4 Vote Option Tree

```
Vote Option Tree (per user, depth: ceil(log2(maxProposals)))
├── Leaf 0: proposal 0에 대한 투표 가중치
├── Leaf 1: proposal 1에 대한 투표 가중치
└── ...

voteOptionRoot = Merkle root of vote options
```

---

## 4. 스마트 컨트랙트 설계

### 4.1 PrivateVotingV2.sol — 메인 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PoseidonT5.sol";

contract PrivateVotingV2 {
    // ============ Constants ============
    uint256 public constant TREE_DEPTH = 20;
    uint256 public constant MESSAGE_TREE_DEPTH = 20;
    uint8 public constant PHASE_VOTING = 0;
    uint8 public constant PHASE_PROCESSING = 1;
    uint8 public constant PHASE_FINALIZED = 2;

    // ============ Coordinator ============
    uint256 public coordinatorPubKeyX;
    uint256 public coordinatorPubKeyY;
    address public coordinator;

    // ============ Verifiers ============
    IMessageProcessorVerifier public immutable msgVerifier;
    ITallyVerifier public immutable tallyVerifier;

    // ============ State ============
    uint256 public stateTreeRoot;
    uint256 public numSignUps;
    uint256 public messageTreeRoot;
    uint256 public numMessages;

    // ============ Proposal ============
    struct ProposalV2 {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;           // Voting 종료
        uint256 processDeadline;   // Processing 기한
        uint256 stateTreeRoot;     // 등록 시점 스냅샷
        uint256 messageTreeRoot;   // 최종 메시지 트리
        uint256 forVotes;          // 집계 결과 (Coordinator 제출)
        uint256 againstVotes;
        uint256 abstainVotes;      // D1 only
        uint256 totalVoters;
        bool tallyVerified;        // tally proof 검증 완료 여부
        bool exists;
    }

    uint256 public proposalCount;
    mapping(uint256 => ProposalV2) public proposals;

    // ============ Trees ============
    // State Tree: stateLeaves[index] = Poseidon(pubKeyX, pubKeyY, voteOptionRoot, balance, nonce)
    mapping(uint256 => uint256) public stateLeaves;

    // Message Tree: Incremental Merkle Tree
    // 온체인에는 root만 유지, leaf 데이터는 이벤트로 발행
    uint256[MESSAGE_TREE_DEPTH] public messageTreeZeros;
    uint256[MESSAGE_TREE_DEPTH] public messageTreeFilledSubtrees;

    // ============ Events ============
    event SignedUp(
        uint256 indexed stateIndex,
        uint256 pubKeyX,
        uint256 pubKeyY,
        uint256 voiceCreditBalance,
        uint256 timestamp
    );

    event MessagePublished(
        uint256 indexed messageIndex,
        uint256[7] encMessage,
        uint256 encPubKeyX,
        uint256 encPubKeyY
    );

    event ProposalCreatedV2(
        uint256 indexed proposalId,
        string title,
        address indexed proposer,
        uint256 endTime,
        uint256 processDeadline
    );

    event MessagesProcessed(
        uint256 indexed proposalId,
        uint256 newStateRoot
    );

    event TallyPublished(
        uint256 indexed proposalId,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    );

    // ============ Errors ============
    error NotCoordinator();
    error ProposalNotFound();
    error NotInVotingPhase();
    error NotInProcessingPhase();
    error AlreadyFinalized();
    error InvalidProof();
    error AlreadySignedUp();

    // ============ Modifiers ============
    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _coordinator,
        uint256 _coordPubKeyX,
        uint256 _coordPubKeyY,
        address _msgVerifier,
        address _tallyVerifier
    ) {
        coordinator = _coordinator;
        coordinatorPubKeyX = _coordPubKeyX;
        coordinatorPubKeyY = _coordPubKeyY;
        msgVerifier = IMessageProcessorVerifier(_msgVerifier);
        tallyVerifier = ITallyVerifier(_tallyVerifier);
    }

    // ============ Registration ============

    /// @notice 유권자 등록 (EdDSA 공개키 제출)
    /// @param _pubKeyX Baby Jubjub 공개키 X
    /// @param _pubKeyY Baby Jubjub 공개키 Y
    /// @param _voiceCreditBalance 초기 voice credit
    function signUp(
        uint256 _pubKeyX,
        uint256 _pubKeyY,
        uint256 _voiceCreditBalance
    ) external {
        numSignUps++;
        uint256 stateIndex = numSignUps;

        // State leaf = Poseidon(pubKeyX, pubKeyY, emptyVoteOptionRoot, balance, 0)
        uint256 leaf = PoseidonT5.hash([
            _pubKeyX,
            _pubKeyY,
            0,  // empty vote option root
            _voiceCreditBalance
        ]);
        stateLeaves[stateIndex] = leaf;

        // Update state tree root (incremental)
        _updateStateTree(stateIndex, leaf);

        emit SignedUp(stateIndex, _pubKeyX, _pubKeyY, _voiceCreditBalance, block.timestamp);
    }

    // ============ Voting ============

    /// @notice 암호화 투표 메시지 제출 (Reveal 없음)
    /// @param _encMessage 암호화된 command (7 필드)
    /// @param _encPubKeyX 임시 공개키 X (ECDH)
    /// @param _encPubKeyY 임시 공개키 Y
    function publishMessage(
        uint256 _proposalId,
        uint256[7] calldata _encMessage,
        uint256 _encPubKeyX,
        uint256 _encPubKeyY
    ) external {
        ProposalV2 storage proposal = proposals[_proposalId];
        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp > proposal.endTime) revert NotInVotingPhase();

        numMessages++;

        // Message leaf = Poseidon(encMessage[0..6], encPubKeyX, encPubKeyY)
        // 9개 입력을 2단계 해시로 처리
        uint256 innerHash = PoseidonT5.hash([
            _encMessage[0], _encMessage[1], _encMessage[2], _encMessage[3]
        ]);
        uint256 messageLeaf = PoseidonT5.hash([
            innerHash, _encMessage[4], _encMessage[5], _encMessage[6]
        ]);

        // Update message tree
        _updateMessageTree(numMessages - 1, messageLeaf);

        emit MessagePublished(numMessages - 1, _encMessage, _encPubKeyX, _encPubKeyY);
    }

    // ============ Processing (Coordinator only) ============

    /// @notice State transition 배치 증명 검증
    /// @dev Coordinator가 오프체인에서 메시지 처리 후 증명 제출
    function processMessages(
        uint256 _proposalId,
        uint256 _newStateRoot,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[] calldata _pubSignals
    ) external onlyCoordinator {
        ProposalV2 storage proposal = proposals[_proposalId];
        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp <= proposal.endTime) revert NotInProcessingPhase();
        if (proposal.tallyVerified) revert AlreadyFinalized();

        // ZKP 검증: state transition이 올바른지
        bool valid = msgVerifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        if (!valid) revert InvalidProof();

        // State root 업데이트
        stateTreeRoot = _newStateRoot;
        proposal.stateTreeRoot = _newStateRoot;

        emit MessagesProcessed(_proposalId, _newStateRoot);
    }

    /// @notice 집계 결과 + 증명 제출
    function tallyVotes(
        uint256 _proposalId,
        uint256 _forVotes,
        uint256 _againstVotes,
        uint256 _abstainVotes,
        uint256 _totalVoters,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[] calldata _pubSignals
    ) external onlyCoordinator {
        ProposalV2 storage proposal = proposals[_proposalId];
        if (!proposal.exists) revert ProposalNotFound();
        if (proposal.tallyVerified) revert AlreadyFinalized();

        // ZKP 검증: tally가 올바른지
        bool valid = tallyVerifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        if (!valid) revert InvalidProof();

        // 결과 기록
        proposal.forVotes = _forVotes;
        proposal.againstVotes = _againstVotes;
        proposal.abstainVotes = _abstainVotes;
        proposal.totalVoters = _totalVoters;
        proposal.tallyVerified = true;

        emit TallyPublished(_proposalId, _forVotes, _againstVotes, _abstainVotes);
    }

    // ============ View Functions ============

    function getProposalV2(uint256 _proposalId) external view returns (
        uint256 id, string memory title, string memory description,
        address proposer, uint256 endTime, uint256 processDeadline,
        uint256 forVotes, uint256 againstVotes, uint256 abstainVotes,
        uint256 totalVoters, bool tallyVerified, uint8 phase
    ) {
        ProposalV2 storage p = proposals[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        uint8 currentPhase;
        if (block.timestamp <= p.endTime) currentPhase = PHASE_VOTING;
        else if (!p.tallyVerified) currentPhase = PHASE_PROCESSING;
        else currentPhase = PHASE_FINALIZED;

        return (
            p.id, p.title, p.description, p.proposer,
            p.endTime, p.processDeadline,
            p.forVotes, p.againstVotes, p.abstainVotes,
            p.totalVoters, p.tallyVerified, currentPhase
        );
    }

    function getPhaseV2(uint256 _proposalId) external view returns (uint8) {
        ProposalV2 storage p = proposals[_proposalId];
        if (!p.exists) revert ProposalNotFound();
        if (block.timestamp <= p.endTime) return PHASE_VOTING;
        if (!p.tallyVerified) return PHASE_PROCESSING;
        return PHASE_FINALIZED;
    }

    // ============ Internal ============

    function _updateStateTree(uint256 _index, uint256 _leaf) internal {
        // Incremental Merkle Tree 업데이트 (생략 - AccQueue 또는 IncrementalMerkleTree 라이브러리)
    }

    function _updateMessageTree(uint256 _index, uint256 _leaf) internal {
        // Incremental Merkle Tree 업데이트 (생략)
    }
}

interface IMessageProcessorVerifier {
    function verifyProof(
        uint256[2] calldata _pA, uint256[2][2] calldata _pB,
        uint256[2] calldata _pC, uint256[] calldata _pubSignals
    ) external view returns (bool);
}

interface ITallyVerifier {
    function verifyProof(
        uint256[2] calldata _pA, uint256[2][2] calldata _pB,
        uint256[2] calldata _pC, uint256[] calldata _pubSignals
    ) external view returns (bool);
}
```

### 4.2 V1 vs V2 컨트랙트 매핑

| V1 함수 | V2 함수 | 변경 이유 |
|---------|---------|----------|
| `registerVoter()` | `signUp()` | EdDSA pubkey 등록 |
| `createProposalD1/D2()` | `createProposalV2()` | Phase 구조 변경 |
| `castVoteD1/D2()` | `publishMessage()` | 암호화 메시지로 대체 |
| `revealVoteD1/D2()` | **삭제** | Reveal 자체 제거 |
| `getProposalD1/D2()` | `getProposalV2()` | 통합 |
| `getPhaseD1/D2()` | `getPhaseV2()` | 3-phase → 3-phase (의미 변경) |
| (없음) | `processMessages()` | Coordinator state transition |
| (없음) | `tallyVotes()` | Coordinator tally 검증 |

---

## 5. ZK 회로 설계

### 5.1 MessageProcessor.circom — State Transition 검증

```circom
// 핵심 검증 로직 (의사코드)
template MessageProcessor(stateTreeDepth, messageTreeDepth, batchSize) {
    // === Public Inputs ===
    signal input inputStateRoot;        // 처리 전 state root
    signal input outputStateRoot;       // 처리 후 state root
    signal input inputMessageRoot;      // 메시지 트리 root
    signal input coordinatorPubKeyX;    // Coordinator 공개키
    signal input coordinatorPubKeyY;

    // === Private Inputs (per message in batch) ===
    signal input messages[batchSize][7];       // 암호화 메시지
    signal input encPubKeys[batchSize][2];     // 임시 공개키
    signal input coordinatorSk;                // Coordinator 비밀키

    // === Per-message processing ===
    for (var i = 0; i < batchSize; i++) {
        // 1. ECDH 복호화
        //    sharedKey = ECDH(coordinatorSk, encPubKeys[i])
        //    command = decrypt(messages[i], sharedKey)

        // 2. EdDSA 서명 검증
        //    verify(command.signature, command, stateLeaf.pubKey)

        // 3. Nonce 검증
        //    command.nonce === stateLeaf.nonce + 1

        // 4. Key Change 처리 (if command.newPubKey != currentPubKey)
        //    stateLeaf.pubKey = command.newPubKey
        //    이전 키로 서명된 후속 메시지는 무효

        // 5. Vote 처리
        //    voteOptionTree[command.voteOptionIndex] = command.newVoteWeight
        //    voiceCreditBalance -= cost(command.newVoteWeight)

        // 6. State leaf 업데이트
        //    newLeaf = Poseidon(newPubKey, newVoteOptionRoot, newBalance, newNonce)
        //    stateTree.update(command.stateIndex, newLeaf)
    }

    // 7. 최종 state root 검증
    //    computedOutputRoot === outputStateRoot
}
```

**예상 제약 수**: ~500K~1M constraints (batchSize에 따라)

### 5.2 TallyVotes.circom — 집계 검증

```circom
// 핵심 검증 로직 (의사코드)
template TallyVotes(stateTreeDepth, voteOptionTreeDepth, batchSize) {
    // === Public Inputs ===
    signal input stateRoot;              // 최종 state root
    signal input tallyCommitment;        // 집계 결과 commitment
    signal input newTallyCommitment;     // 업데이트된 집계

    // === Private Inputs ===
    signal input stateLeaves[batchSize];     // 배치 내 state leaves
    signal input voteWeights[batchSize];     // 각 유저의 투표 가중치

    // === Tally Logic ===
    for (var i = 0; i < batchSize; i++) {
        // 1. State leaf가 stateRoot에 포함되는지 Merkle 검증
        // 2. voteWeight가 state leaf의 voteOptionTree에서 정확한지 검증
        // 3. 집계에 추가: tally[option] += voteWeight
    }

    // 4. newTallyCommitment = Poseidon(tally[0], tally[1], ...)
    // 5. 검증: 계산된 commitment === newTallyCommitment
}
```

**예상 제약 수**: ~200K constraints

### 5.3 기존 회로 재사용

| 기존 회로 | V2에서의 역할 | 변경 |
|-----------|-------------|------|
| `PrivateVoting.circom` | signUp 시 자격 검증 (토큰 소유 증명) | **유지** — 등록 단계에서 사용 |
| `D2_QuadraticVoting.circom` | D2 모드 credit 검증 | **유지** — voiceCreditBalance 초기화 시 사용 |
| `MerkleProof` template | State/Message Tree 검증 | **재사용** |
| `SecretToPublic` template | 키 소유권 증명 | **재사용** |

---

## 6. Coordinator 서비스 설계

### 6.1 디렉토리 구조

```
coordinator/
├── src/
│   ├── index.ts              # 메인 엔트리, 이벤트 리스너
│   ├── crypto/
│   │   ├── ecdh.ts           # ECDH 키 교환
│   │   ├── encrypt.ts        # Poseidon 암호화/복호화
│   │   └── eddsa.ts          # EdDSA 서명 검증
│   ├── trees/
│   │   ├── stateTree.ts      # State Tree 관리
│   │   ├── messageTree.ts    # Message Tree 관리
│   │   └── voteOptionTree.ts # Vote Option Tree 관리
│   ├── processing/
│   │   ├── processMessages.ts # 메시지 순차 처리
│   │   ├── tally.ts          # 투표 집계
│   │   └── batchProof.ts     # 배치 ZKP 생성
│   └── chain/
│       ├── listener.ts       # 온체인 이벤트 수신
│       └── submitter.ts      # 트랜잭션 제출
├── package.json
└── tsconfig.json
```

### 6.2 처리 시퀀스

```typescript
// coordinator/src/processing/processMessages.ts

async function processAllMessages(
  coordinatorSk: bigint,
  messages: EncryptedMessage[],
  stateTree: IncrementalMerkleTree
): Promise<ProcessResult> {

  for (const msg of messages) {
    // 1. 복호화
    const sharedKey = ecdh(coordinatorSk, msg.encPubKey);
    const command = decrypt(msg.data, sharedKey);

    // 2. State leaf 조회
    const stateLeaf = stateTree.getLeaf(command.stateIndex);

    // 3. 서명 검증
    const validSig = verifyEdDSA(command, stateLeaf.pubKey);
    if (!validSig) continue;  // 무효 메시지 스킵

    // 4. Nonce 검증
    if (command.nonce !== stateLeaf.nonce + 1n) continue;

    // 5. Key Change 처리
    if (command.newPubKeyX !== stateLeaf.pubKeyX ||
        command.newPubKeyY !== stateLeaf.pubKeyY) {
      stateLeaf.pubKeyX = command.newPubKeyX;
      stateLeaf.pubKeyY = command.newPubKeyY;
    }

    // 6. Vote 처리
    const voteCost = calculateCost(command.newVoteWeight, votingMode);
    if (voteCost > stateLeaf.voiceCreditBalance) continue;

    stateLeaf.voteOptionTree.update(
      command.voteOptionIndex,
      command.newVoteWeight
    );
    stateLeaf.voiceCreditBalance -= voteCost;
    stateLeaf.nonce++;

    // 7. State Tree 업데이트
    stateTree.update(command.stateIndex, hashStateLeaf(stateLeaf));
  }

  return { newStateRoot: stateTree.root };
}
```

### 6.3 D1/D2 모드 분기

```typescript
function calculateCost(voteWeight: bigint, mode: 'D1' | 'D2'): bigint {
  if (mode === 'D1') {
    // D1: 1:1 비용. votingPower = noteValue
    return voteWeight;
  } else {
    // D2: Quadratic. creditsSpent = numVotes²
    return voteWeight * voteWeight;
  }
}
```

---

## 7. ECDH 암호화 모듈

### 7.1 키 교환

```typescript
// src/crypto/ecdh.ts

import { buildBabyjub } from 'circomlibjs';

/**
 * ECDH 공유 비밀키 생성
 * 기존 Baby Jubjub 키 인프라 100% 재사용
 */
function generateECDHSharedKey(
  sk: bigint,           // 내 비밀키
  otherPubKey: [bigint, bigint]  // 상대 공개키 [x, y]
): bigint {
  const babyJub = await buildBabyjub();
  // shared = sk * otherPubKey (스칼라 곱셈)
  const sharedPoint = babyJub.mulPointEscalar(
    [otherPubKey[0], otherPubKey[1]],
    sk
  );
  // X 좌표를 shared secret으로 사용
  return babyJub.F.toObject(sharedPoint[0]);
}
```

### 7.2 메시지 암호화/복호화

```typescript
// Poseidon 기반 대칭 암호화 (MACI 방식)
function encryptCommand(
  command: Command,
  sharedKey: bigint
): bigint[] {
  const plaintext = [
    command.stateIndex,
    command.newPubKeyX,
    command.newPubKeyY,
    command.voteOptionIndex,
    command.newVoteWeight,
    command.nonce,
    command.salt
  ];

  // Poseidon 기반 CTR 모드 암호화
  return poseidonEncrypt(plaintext, sharedKey);
}
```

---

## 8. Key Change 메커니즘 설계

### 8.1 Key Change 흐름 상세

```
시나리오: Alice가 강압 상태에서 투표 후 번복

시간순서:
─────────────────────────────────────────────────

T1: Alice signUp(pk1)
    → State Tree에 pk1 등록
    → stateIndex = 5, nonce = 0

T2: Bob(매수자): "찬성에 투표해!"
    Alice: publishMessage(encrypt({
      stateIndex: 5,
      newPubKey: pk1,      // 키 변경 없음
      voteOption: 0,       // proposalId = 0
      voteWeight: 1,       // 찬성
      nonce: 1
    }, pk1))
    → Bob은 Alice가 투표한 것만 확인, 내용은 암호화

T3: Alice (혼자): publishMessage(encrypt({
      stateIndex: 5,
      newPubKey: pk2,      // 키를 pk2로 변경!
      voteOption: 0,
      voteWeight: 0,       // 투표 리셋
      nonce: 2
    }, pk1))               // 현재 키(pk1)로 서명
    → Bob은 이 메시지의 존재도 내용도 알 수 없음

T4: Alice (혼자): publishMessage(encrypt({
      stateIndex: 5,
      newPubKey: pk2,      // pk2 유지
      voteOption: 0,
      voteWeight: 1,       // 반대로 재투표
      nonce: 3
    }, pk2))               // 새 키(pk2)로 서명
    → 최종 투표: 반대

Coordinator 처리:
  T2 메시지: pk1으로 서명 유효, nonce=1 유효 → 찬성 기록
  T3 메시지: pk1으로 서명 유효, nonce=2 유효 → 키 변경, 투표 리셋
  T4 메시지: pk2로 서명 유효, nonce=3 유효 → 반대 기록 (최종)

결과: Alice의 최종 투표 = 반대
Bob은 T3, T4의 존재를 알 수 없으므로 매수 실패
```

### 8.2 유효성 규칙

```
메시지 유효 조건 (모두 충족해야 함):
1. stateIndex < numSignUps
2. EdDSA 서명이 현재 state leaf의 pubKey로 유효
3. nonce === currentNonce + 1
4. voiceCreditBalance >= cost(newVoteWeight)
5. voteOptionIndex < maxProposals

무효 메시지 처리:
- Coordinator가 무시 (state 변경 없음)
- ZKP에서도 무효 메시지 처리를 증명해야 함 (skip proof)
```

---

## 9. 프론트엔드 설계

### 9.1 Phase별 UI 매핑 (V2)

| Phase | UI 컴포넌트 | 주요 액션 |
|-------|------------|----------|
| 0 (Voting) | `VoteFormV2.tsx` | 투표 (암호화 전송) |
| 1 (Processing) | `ProcessingStatus.tsx` | "집계 진행 중" 대기 |
| 2 (Finalized) | `VoteResult.tsx` | 결과 조회 |

### 9.2 컴포넌트 구조 (V2)

```
src/components/
├── QuadraticVotingDemo.tsx       # 메인 (V2 모드 추가)
├── voting/
│   ├── VoteFormV2.tsx            # 암호화 투표 폼 (NEW)
│   ├── ProcessingStatus.tsx      # 집계 대기 UI (NEW)
│   ├── VoteResult.tsx            # 결과 (기존 확장)
│   ├── PhaseIndicator.tsx        # Phase 표시 (V2 적응)
│   └── KeyManager.tsx            # 키 변경 UI (NEW)
│   ├── RevealForm.tsx            # DEPRECATED (V2에서 삭제)
```

### 9.3 투표 흐름 변경 (V2)

```
V1 (현재):
  지갑 연결 → 등록 → 제안 선택 → 투표(Commit) → 대기 → 공개(Reveal) → 결과

V2 (목표):
  지갑 연결 → 등록(signUp) → 제안 선택 → 투표(암호화 전송) → 결과 대기 → 결과
                                                    └─ 필요시 키 변경 후 재투표
```

### 9.4 VoteFormV2 데이터 흐름

```typescript
async function handleVoteV2(proposalId: bigint, choice: number, weight: bigint) {
  // 1. 현재 키쌍 로드
  const { sk, pkX, pkY } = getOrCreateKeyPair(walletAddress);

  // 2. Command 구성
  const command: Command = {
    stateIndex: myStateIndex,
    newPubKeyX: pkX,      // 키 변경 없으면 현재 키
    newPubKeyY: pkY,
    voteOptionIndex: proposalId,
    newVoteWeight: weight,
    nonce: currentNonce + 1n,
    salt: randomSalt()
  };

  // 3. EdDSA 서명
  const signature = eddsaSign(command, sk);

  // 4. ECDH 암호화
  const ephemeralSk = randomScalar();
  const ephemeralPk = derivePublicKey(ephemeralSk);
  const sharedKey = ecdh(ephemeralSk, [coordinatorPubKeyX, coordinatorPubKeyY]);
  const encMessage = encryptCommand({ ...command, ...signature }, sharedKey);

  // 5. 온체인 제출
  await writeContract({
    address: PRIVATE_VOTING_V2_ADDRESS,
    abi: PRIVATE_VOTING_V2_ABI,
    functionName: 'publishMessage',
    args: [proposalId, encMessage, ephemeralPk[0], ephemeralPk[1]]
  });

  // 6. localStorage에 nonce만 저장 (Reveal 데이터 불필요!)
  saveNonce(walletAddress, proposalId, currentNonce + 1n);
}
```

---

## 10. 에러 처리

### 10.1 V2 에러 매핑

| 컨트랙트 에러 | 사용자 메시지 |
|--------------|-------------|
| NotInVotingPhase | 투표 기간이 아닙니다 |
| NotCoordinator | Coordinator만 실행할 수 있습니다 |
| InvalidProof | 증명 검증에 실패했습니다 |
| AlreadyFinalized | 이미 집계가 완료되었습니다 |
| ProposalNotFound | 제안을 찾을 수 없습니다 |

### 10.2 Coordinator 장애 대응

| 상황 | 대응 |
|------|------|
| Coordinator 미응답 | processDeadline 이후 대체 Coordinator 지정 가능 |
| 잘못된 증명 제출 | 온체인 verifier가 revert |
| 부분 처리 | 여러 번 processMessages 호출 (배치) |

---

## 11. 구현 순서

### Step 1: 암호화 인프라 (의존성 없음)
- `src/crypto/ecdh.ts` — ECDH 키 교환
- `src/crypto/encrypt.ts` — Poseidon 암호화
- `src/crypto/eddsa.ts` — EdDSA 서명
- 단위 테스트 작성

### Step 2: Merkle Tree 컨트랙트 (의존성 없음)
- Incremental Merkle Tree 라이브러리 (State + Message)
- Forge 테스트

### Step 3: PrivateVotingV2.sol (Step 2 의존)
- signUp, publishMessage, processMessages, tallyVotes
- Forge 테스트 (mock verifier)

### Step 4: MessageProcessor 회로 (Step 1 의존)
- 메시지 복호화 + state transition 검증
- Circom 컴파일 + witness 테스트

### Step 5: TallyVotes 회로 (Step 4 의존)
- 집계 정확성 증명
- Circom 컴파일 + witness 테스트

### Step 6: Coordinator 서비스 (Step 3, 4, 5 의존)
- 이벤트 리스너 + 메시지 처리 + 증명 생성 + 온체인 제출
- 통합 테스트

### Step 7: 프론트엔드 V2 (Step 3, 6 의존)
- VoteFormV2, ProcessingStatus, KeyManager
- E2E 테스트

### Step 8: Key Change 확장 (Step 4 의존)
- MessageProcessor에 key change 로직 추가
- 시나리오 테스트 (매수 방어)

---

## 12. 테스트 계획

### 12.1 컨트랙트 테스트 (Forge)

| # | 테스트 | 검증 내용 |
|:-:|--------|----------|
| 1 | `test_SignUp` | 등록 → stateIndex 발급, State Tree 업데이트 |
| 2 | `test_PublishMessage` | 암호화 메시지 → Message Tree 업데이트, 이벤트 발행 |
| 3 | `test_PublishMessage_AfterVotingPhase` | 투표 종료 후 → revert NotInVotingPhase |
| 4 | `test_ProcessMessages` | 유효 proof → state root 업데이트 |
| 5 | `test_ProcessMessages_InvalidProof` | 잘못된 proof → revert InvalidProof |
| 6 | `test_ProcessMessages_NotCoordinator` | 일반 유저 → revert NotCoordinator |
| 7 | `test_TallyVotes` | 유효 proof → 결과 기록, tallyVerified = true |
| 8 | `test_TallyVotes_InvalidProof` | 잘못된 proof → revert |
| 9 | `test_TallyVotes_AlreadyFinalized` | 중복 tally → revert |
| 10 | `test_NoRevealFunction` | ABI에 reveal 함수 부재 확인 |
| 11 | `test_IntegrationFlow` | 등록 → 투표 → 처리 → 집계 전체 흐름 |

### 12.2 회로 테스트

| # | 테스트 | 검증 내용 |
|:-:|--------|----------|
| 1 | ECDH 복호화 정확성 | 암호화 → 복호화 → 원본 일치 |
| 2 | EdDSA 서명 검증 | 유효 서명 통과, 무효 서명 실패 |
| 3 | State transition 정확성 | 메시지 처리 후 state root 일치 |
| 4 | Key Change 반영 | 키 변경 후 이전 키 서명 무효 |
| 5 | Tally 정확성 | 집계 결과와 commitment 일치 |

### 12.3 Anti-Coercion 시나리오 테스트

| # | 시나리오 | 기대 결과 |
|:-:|---------|----------|
| 1 | 강압 투표 후 키 변경 + 재투표 | 재투표가 최종 (8.1 시나리오) |
| 2 | 매수자가 투표 내용 확인 시도 | 암호화로 확인 불가 |
| 3 | 매수자에게 이전 키 제공 | 키 이미 변경, 복호화해도 무효 투표 |
| 4 | Coordinator가 투표 누락 시도 | Message Tree 포함 후 미처리 → proof 실패 |

---

## 13. 파일별 변경 사항

### 13.1 신규 생성

| 파일 | LOC 예상 | 목적 |
|------|:--------:|------|
| `contracts/PrivateVotingV2.sol` | ~400 | V2 메인 컨트랙트 |
| `contracts/IncrementalMerkleTree.sol` | ~150 | State/Message Tree |
| `contracts/MessageProcessorVerifier.sol` | ~200 | 자동 생성 |
| `contracts/TallyVerifier.sol` | ~200 | 자동 생성 |
| `circuits/MessageProcessor.circom` | ~300 | 메시지 처리 회로 |
| `circuits/TallyVotes.circom` | ~150 | 집계 회로 |
| `coordinator/src/**` | ~800 | Coordinator 서비스 전체 |
| `src/crypto/ecdh.ts` | ~60 | ECDH 모듈 |
| `src/crypto/encrypt.ts` | ~80 | 암호화 모듈 |
| `src/crypto/eddsa.ts` | ~60 | EdDSA 모듈 |
| `src/components/voting/VoteFormV2.tsx` | ~200 | 암호화 투표 폼 |
| `src/components/voting/ProcessingStatus.tsx` | ~80 | 대기 UI |
| `src/components/voting/KeyManager.tsx` | ~150 | 키 관리 UI |
| `test/PrivateVotingV2.t.sol` | ~400 | V2 테스트 |

### 13.2 수정

| 파일 | 변경 내용 | 위험도 |
|------|----------|:------:|
| `src/components/QuadraticVotingDemo.tsx` | V2 모드 분기, Phase 변경 | 높음 |
| `src/zkproof.ts` | ECDH/EdDSA import, encryptCommand 추가 | 높음 |
| `src/contract.ts` | V2 ABI/주소 추가 | 중 |
| `src/components/voting/PhaseIndicator.tsx` | V2 Phase 지원 | 낮음 |
| `src/components/voting/VoteResult.tsx` | tallyVerified 표시 | 낮음 |

### 13.3 폐기 (V2 완성 후)

| 파일/함수 | 이유 |
|-----------|------|
| `src/components/voting/RevealForm.tsx` | Reveal 불필요 |
| `revealVoteD1/D2()` 호출 코드 | V2에서 제거 |
| localStorage reveal 데이터 저장/로드 | 불필요 |

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-13 | AI | Plan 기반 초기 Design 작성 |
