# Design: MACI Anti-Collusion Infrastructure 적용

> **Feature**: maci-anti-collusion
> **Phase**: Design
> **Created**: 2026-02-13
> **Updated**: 2026-02-13
> **Status**: DRAFT
> **Plan Reference**: `docs/01-plan/features/maci-anti-collusion.plan.md`
> **Spec Reference**: `docs/specs/d1-private-voting.spec.md`, `docs/specs/d2-quadratic.spec.md`

---

## 1. 설계 원칙

### 1.1 스펙 준수 (절대)
- D1/D2 스펙의 **공개입력, 해시 수식, 선택지** 변경 금지
- MACI 원리를 적용하되, 기존 스펙의 암호학적 기본요소(Poseidon, Baby Jubjub, Groth16)를 유지
- D1 choice: {0, 1, 2}, D2 choice: {0, 1} — 변경 불가

### 1.2 MACI 7대 보안 속성 전체 충족
- **Collusion Resistance**: Coordinator만 투표 검증 가능, 매수자 불가
- **Receipt-freeness**: Key Change + 역순 처리로 투표 증명 불가
- **Privacy**: 온체인에 choice 평문 없음, Coordinator만 복호화
- **Uncensorability**: 불변 온체인 AccQueue, 누락 시 proof 실패
- **Unforgeability**: EdDSA 서명 필수
- **Non-repudiation**: 투표 삭제 불가, 새 투표로만 덮어쓰기
- **Correct Execution**: zk-SNARK 온체인 검증

### 1.3 Reveal 제거가 핵심
- `revealVote*()` 함수 완전 제거
- `VoteRevealed*` 이벤트 제거
- 개별 투표 choice는 **온체인에 평문으로 절대 기록되지 않음**
- 공개되는 것은 **집계 결과(forVotes, againstVotes)만**

### 1.4 V1과 V2 병행
- V1(`ZkVotingFinal.sol`)은 기존 배포 유지 (deprecated)
- V2는 MACI 분리 패턴으로 새 주소 배포
- 프론트엔드에서 V2 우선 사용, V1은 읽기 전용

---

## 2. 시스템 아키텍처

### 2.1 전체 흐름

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Registration                         │
│                                                                      │
│  [투표자] ──signUp(pubKeyX, pubKeyY)──> [MACI.sol]                  │
│                                         └─ SignUpGatekeeper 검증     │
│                                         └─ VoiceCreditProxy 조회     │
│                                         └─ State AccQueue에 leaf 추가│
│                                         └─ stateIndex 발급           │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Voting                               │
│                                                                      │
│  [투표자]                                                             │
│    1. command = {stateIndex, newPubKey, voteOption, weight, nonce,   │
│                  pollId, salt} (binary-packed)                        │
│    2. signature = EdDSA.sign(commandHash, sk)                        │
│    3. sharedKey = ECDH(sk_ephemeral, coordinatorPubKey)              │
│    4. encMessage = PoseidonDuplexSponge.encrypt(                     │
│         command + signature, sharedKey)                               │
│    5. ──publishMessage(encMessage, encPubKey)──> [Poll.sol]          │
│                                                  └─ Message AccQueue │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                      PHASE: AccQueue Merge                           │
│                                                                      │
│  [Coordinator 또는 누구나]                                            │
│    1. Poll.mergeMaciStateAqSubRoots() — State AccQueue subtree 병합  │
│    2. Poll.mergeMaciStateAq() — State AccQueue 최종 root 확정        │
│    3. Poll.mergeMessageAqSubRoots() — Message AccQueue subtree 병합  │
│    4. Poll.mergeMessageAq() — Message AccQueue 최종 root 확정        │
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Processing                           │
│                                                                      │
│  [Coordinator]                                                       │
│    1. Message Tree에서 전체 메시지 읽기                                │
│    2. ★ 역순(마지막 → 처음) 배치 처리:                                │
│       a. ECDH 복호화 (Poseidon DuplexSponge)                         │
│       b. EdDSA 서명 검증                                              │
│       c. 유효: State transition 적용                                  │
│       d. 무효: blank leaf (index 0)로 라우팅 (회로 내 증명)           │
│    3. 배치별 processMessages ZKP 생성                                 │
│    4. SHA256으로 public input 압축                                    │
│    5. ──processMessages(proof)──> [MessageProcessor.sol] ← 온체인 검증│
└──────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────┐
│                          PHASE: Tallying                             │
│                                                                      │
│  [Coordinator]                                                       │
│    1. 최종 State Tree + Ballot Tree에서 모든 유효 투표 집계            │
│    2. D1: forVotes += votingPower, D2: forVotes += numVotes           │
│    3. tallyCommitment = poseidon_3([votesRoot, totalSpent,            │
│                                     perOptionSpent])                  │
│    4. 배치별 tallyVotes ZKP 생성                                      │
│    5. ──tallyVotes(proof, results)──> [Tally.sol] ← 검증+저장        │
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
| — | **Merging** | 1 | AccQueue merge 진행 중 | mergeMaci*() |
| Reveal | **Processing** | 2 | `endTime < now && !tallyVerified` | processMessages (Coordinator) |
| Ended | **Finalized** | 3 | `tallyVerified == true` | getResults (읽기만) |

---

## 3. 데이터 구조

### 3.1 State Tree Leaf (MACI 4-input)

```
State Tree (Quinary, depth 10, arity 5 → 5^10 ≈ 9.7M leaves)
├── Leaf 0: Blank State Leaf (reserved, 무효 메시지 라우팅 대상)
├── Leaf 1: 첫 번째 등록 유저
├── Leaf 2: 두 번째 등록 유저
└── ...

Leaf 구조 (MACI 원본 동일):
┌─────────────────────────────────────────────┐
│  stateLeaf = poseidon_4([                   │
│    pubKeyX,              // 현재 공개키 X    │
│    pubKeyY,              // 현재 공개키 Y    │
│    voiceCreditBalance,   // 남은 크레딧      │
│    timestamp             // 등록/변경 시각    │
│  ])                                         │
└─────────────────────────────────────────────┘

Blank State Leaf (index 0):
  MACI에서 정의한 고정값 (Pedersen generator 기반)
  → 무효 메시지가 라우팅되는 대상
  → 무한한 voice credit, 특수 pubKey
  → 어떤 command를 적용해도 state에 실질 영향 없음
```

**TypeScript 타입**:
```typescript
interface StateLeaf {
  pubKeyX: bigint;
  pubKeyY: bigint;
  voiceCreditBalance: bigint;
  timestamp: bigint;
}

// MACI Blank State Leaf: 모든 무효 메시지는 이 leaf에 적용
const BLANK_STATE_LEAF: StateLeaf = {
  pubKeyX: NOTHING_UP_MY_SLEEVE_PUBKEY[0],  // Pedersen generator
  pubKeyY: NOTHING_UP_MY_SLEEVE_PUBKEY[1],
  voiceCreditBalance: BigInt(2n ** 32n),     // 충분히 큰 값
  timestamp: 0n,
};
```

### 3.2 Ballot (별도 도메인 객체, MACI 원본)

```
Ballot Tree (per user, Quinary)
├── blt_v[i] = 각 vote option에 할당한 weight
├── blt_n = nonce (0부터 시작, 첫 유효 command nonce = 1)
├── blt_r = Merkle root of vote weights (quinary tree)

Ballot Hash:
  ballotHash = poseidon_2([blt_n, blt_r])

※ State Leaf에 voteOptionRoot를 넣지 않고 Ballot로 분리
※ State와 Ballot을 별도 트리로 관리하여 관심사 분리
```

**TypeScript 타입**:
```typescript
interface Ballot {
  votes: bigint[];        // vote option별 weight
  nonce: bigint;          // 처리된 메시지 수
  voteOptionRoot: bigint; // quinary Merkle root of votes
}
```

### 3.3 Command & Message 구조 (MACI binary-packed)

```
Command (binary-packed, MACI 원본):
┌─────────────────────────────────────────────┐
│  command = {                                │
│    stateIndex:      50 bits,  // State Tree │
│    newPubKeyX:     253 bits,  // 키 변경용   │
│    newPubKeyY:     253 bits,                │
│    voteOptionIndex: 50 bits,  // proposalId │
│    newVoteWeight:   50 bits,  // 투표 가중치 │
│    nonce:           50 bits,  // 순서 번호   │
│    pollId:          50 bits,  // Poll 식별자 │
│    salt:           253 bits   // 랜덤값      │
│  }                                          │
│                                             │
│  commandHash = poseidon_4([                 │
│    packedValues,  // bit-packed 필드들       │
│    newPubKeyX,                              │
│    newPubKeyY,                              │
│    salt                                     │
│  ])                                         │
│                                             │
│  signature = EdDSA.sign(commandHash, sk)    │
│                                             │
│  Message (암호화):                           │
│    plaintext = packed command fields         │
│                + signature (R8[0], R8[1], S) │
│    → Poseidon DuplexSponge 암호화            │
│       (ECDH shared key)                      │
│    → [encMessage[], encPubKey] 온체인 제출   │
└─────────────────────────────────────────────┘
```

**TypeScript 타입**:
```typescript
interface Command {
  stateIndex: bigint;       // 50 bits
  newPubKeyX: bigint;       // 253 bits
  newPubKeyY: bigint;       // 253 bits
  voteOptionIndex: bigint;  // 50 bits (proposalId)
  newVoteWeight: bigint;    // 50 bits (D1: votingPower, D2: numVotes)
  nonce: bigint;            // 50 bits
  pollId: bigint;           // 50 bits
  salt: bigint;             // 253 bits
}

interface Message {
  data: bigint[];        // DuplexSponge 암호화 결과 (10개 필드)
  encPubKeyX: bigint;    // 임시 공개키 X (ECDH용)
  encPubKeyY: bigint;    // 임시 공개키 Y
}

// Command를 4개 field로 bit-pack
function packCommand(cmd: Command): bigint[] {
  const packed = (cmd.stateIndex)
    | (cmd.voteOptionIndex << 50n)
    | (cmd.newVoteWeight << 100n)
    | (cmd.nonce << 150n)
    | (cmd.pollId << 200n);
  return [packed, cmd.newPubKeyX, cmd.newPubKeyY, cmd.salt];
}
```

### 3.4 Message Tree (Quinary + AccQueue)

```
Message Tree (Quinary, arity 5, managed by AccQueue)
├── AccQueue: enqueue → mergeSubRoots → merge
├── 온체인: AccQueue로 leaf 추가 (enqueue)
├── 투표 종료 후: merge로 최종 root 확정
└── Coordinator: 전체 leaf 읽어서 오프체인 트리 구축

messageLeaf = poseidon(encMessage[0..9], encPubKeyX, encPubKeyY)
  → 입력이 많으므로 다단계 Poseidon 해싱
```

### 3.5 Vote Option Tree (Quinary)

```
Vote Option Tree (per user, Quinary, depth: configurable)
├── Leaf i: proposal i에 대한 투표 가중치 (weight)
└── root = blt_r (Ballot의 voteOptionRoot)

※ Quinary tree이므로 각 노드가 5개 자식을 가짐
※ Poseidon(5)에 최적화된 해싱
```

---

## 4. 스마트 컨트랙트 설계 (MACI 분리 패턴)

### 4.1 컨트랙트 구조

```
contracts/
├── MACI.sol                     # 등록 전용 (signUp + deployPoll)
├── Poll.sol                     # 투표 전용 (publishMessage + AccQueue merge)
├── MessageProcessor.sol         # State transition 검증
├── Tally.sol                    # 집계 검증
├── AccQueue.sol                 # Quinary AccQueue (enqueue/merge)
├── VkRegistry.sol               # 검증키 레지스트리
├── gatekeepers/
│   ├── ISignUpGatekeeper.sol    # 등록 제한 인터페이스
│   └── FreeForAllGatekeeper.sol # 제한 없는 기본 구현
├── voiceCreditProxy/
│   ├── IVoiceCreditProxy.sol    # Voice credit 할당 인터페이스
│   └── ConstantVoiceCreditProxy.sol # 고정 할당
├── DomainObjs.sol               # 공유 도메인 객체 정의
├── Verifier.sol                 # Groth16 검증기 (자동 생성)
├── PoseidonT3.sol               # 2-input Poseidon (머클 트리 내부 노드)
├── PoseidonT5.sol               # 4-input Poseidon (기존 유지)
├── PoseidonT6.sol               # 5-input Poseidon (State leaf, AccQueue 해싱)
└── Groth16Verifier.sol          # 기존 투표 자격 검증기 (유지)
```

### 4.2 MACI.sol — 등록 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AccQueue.sol";
import "./DomainObjs.sol";
import "./gatekeepers/ISignUpGatekeeper.sol";
import "./voiceCreditProxy/IVoiceCreditProxy.sol";

contract MACI is DomainObjs {
    // ============ State ============
    AccQueue public stateAq;                 // State AccQueue (quinary)
    uint256 public numSignUps;
    ISignUpGatekeeper public signUpGatekeeper;
    IVoiceCreditProxy public voiceCreditProxy;

    uint256 public constant BLANK_STATE_LEAF_HASH = /* Pedersen generator hash */;

    // ============ Poll Registry ============
    mapping(uint256 => address) public polls;
    uint256 public nextPollId;

    // ============ Events ============
    event SignUp(
        uint256 indexed stateIndex,
        uint256 indexed pubKeyX,
        uint256 pubKeyY,
        uint256 voiceCreditBalance,
        uint256 timestamp
    );

    event DeployPoll(
        uint256 indexed pollId,
        address pollAddr,
        address messageProcessorAddr,
        address tallyAddr
    );

    // ============ Constructor ============
    constructor(
        address _signUpGatekeeper,
        address _voiceCreditProxy,
        uint8 _stateTreeDepth
    ) {
        signUpGatekeeper = ISignUpGatekeeper(_signUpGatekeeper);
        voiceCreditProxy = IVoiceCreditProxy(_voiceCreditProxy);

        // Quinary AccQueue 초기화 (arity=5, depth=stateTreeDepth)
        stateAq = new AccQueue(5, _stateTreeDepth);

        // index 0에 blank state leaf 삽입
        stateAq.enqueue(BLANK_STATE_LEAF_HASH);
        numSignUps = 0; // blank leaf는 카운트 안 함
    }

    /// @notice 유권자 등록 (EdDSA 공개키 제출)
    function signUp(
        uint256 _pubKeyX,
        uint256 _pubKeyY,
        bytes memory _signUpGatekeeperData,
        bytes memory _initialVoiceCreditProxyData
    ) external {
        // 1. Gatekeeper 검증 (등록 자격)
        signUpGatekeeper.register(msg.sender, _signUpGatekeeperData);

        // 2. Voice credit 조회
        uint256 voiceCreditBalance = voiceCreditProxy.getVoiceCredits(
            msg.sender, _initialVoiceCreditProxyData
        );

        // 3. State leaf 생성 (MACI 4-input)
        //    poseidon_4([pubKeyX, pubKeyY, voiceCreditBalance, timestamp])
        uint256 stateLeaf = PoseidonT6.hash([
            _pubKeyX,
            _pubKeyY,
            voiceCreditBalance,
            block.timestamp,
            0  // padding for T6 (5-input) → 실제로는 T5(4-input) 사용
        ]);

        // 4. AccQueue에 enqueue
        stateAq.enqueue(stateLeaf);
        numSignUps++;
        uint256 stateIndex = numSignUps; // 1-based (0 = blank)

        emit SignUp(stateIndex, _pubKeyX, _pubKeyY, voiceCreditBalance, block.timestamp);
    }

    /// @notice 새 Poll 배포
    function deployPoll(
        string calldata _title,
        uint256 _duration,
        uint256 _coordinatorPubKeyX,
        uint256 _coordinatorPubKeyY,
        address _verifier,
        address _vkRegistry,
        uint8 _messageTreeDepth
    ) external returns (uint256 pollId) {
        pollId = nextPollId++;

        // Poll, MessageProcessor, Tally 컨트랙트 배포
        Poll poll = new Poll(
            _title,
            _duration,
            _coordinatorPubKeyX,
            _coordinatorPubKeyY,
            address(stateAq),
            numSignUps,
            _messageTreeDepth
        );

        MessageProcessor mp = new MessageProcessor(
            address(poll), _verifier, _vkRegistry
        );

        Tally tally = new Tally(
            address(poll), address(mp), _verifier, _vkRegistry
        );

        polls[pollId] = address(poll);

        emit DeployPoll(pollId, address(poll), address(mp), address(tally));
    }
}
```

### 4.3 Poll.sol — 투표 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AccQueue.sol";
import "./DomainObjs.sol";

contract Poll is DomainObjs {
    // ============ Config ============
    string public title;
    uint256 public immutable deployTime;
    uint256 public immutable duration;
    uint256 public coordinatorPubKeyX;
    uint256 public coordinatorPubKeyY;

    // ============ AccQueues ============
    AccQueue public messageAq;     // Message AccQueue
    address public stateAqAddr;    // MACI's State AccQueue (참조)
    uint256 public numSignUpsAtDeployment;

    // ============ State ============
    uint256 public numMessages;
    bool public stateAqMerged;
    bool public messageAqMerged;

    // ============ Events ============
    event MessagePublished(
        uint256 indexed messageIndex,
        uint256[10] encMessage,    // DuplexSponge 암호화 결과
        uint256 encPubKeyX,
        uint256 encPubKeyY
    );

    // ============ Constructor ============
    constructor(
        string memory _title,
        uint256 _duration,
        uint256 _coordPubKeyX,
        uint256 _coordPubKeyY,
        address _stateAq,
        uint256 _numSignUps,
        uint8 _messageTreeDepth
    ) {
        title = _title;
        deployTime = block.timestamp;
        duration = _duration;
        coordinatorPubKeyX = _coordPubKeyX;
        coordinatorPubKeyY = _coordPubKeyY;
        stateAqAddr = _stateAq;
        numSignUpsAtDeployment = _numSignUps;

        // Message AccQueue (quinary)
        messageAq = new AccQueue(5, _messageTreeDepth);
    }

    /// @notice 암호화 투표 메시지 제출
    function publishMessage(
        uint256[10] calldata _encMessage,   // DuplexSponge 암호화 (10 필드)
        uint256 _encPubKeyX,
        uint256 _encPubKeyY
    ) external {
        require(block.timestamp <= deployTime + duration, "Voting ended");

        // Message leaf 해싱 (다단계 Poseidon)
        uint256 leaf = hashMessageAndEncPubKey(
            _encMessage, _encPubKeyX, _encPubKeyY
        );

        // AccQueue에 enqueue
        messageAq.enqueue(leaf);
        numMessages++;

        emit MessagePublished(numMessages - 1, _encMessage, _encPubKeyX, _encPubKeyY);
    }

    /// @notice AccQueue merge 함수들 (투표 종료 후)
    function mergeMaciStateAqSubRoots(uint256 _numSrQueueOps) external {
        require(block.timestamp > deployTime + duration, "Voting not ended");
        AccQueue(stateAqAddr).mergeSubRoots(_numSrQueueOps);
    }

    function mergeMaciStateAq() external {
        require(block.timestamp > deployTime + duration, "Voting not ended");
        AccQueue(stateAqAddr).merge();
        stateAqMerged = true;
    }

    function mergeMessageAqSubRoots(uint256 _numSrQueueOps) external {
        messageAq.mergeSubRoots(_numSrQueueOps);
    }

    function mergeMessageAq() external {
        messageAq.merge();
        messageAqMerged = true;
    }

    // ============ View ============
    function isVotingOpen() external view returns (bool) {
        return block.timestamp <= deployTime + duration;
    }

    function getDeployTimeAndDuration() external view returns (uint256, uint256) {
        return (deployTime, duration);
    }

    function hashMessageAndEncPubKey(
        uint256[10] calldata _msg,
        uint256 _encPubKeyX,
        uint256 _encPubKeyY
    ) public pure returns (uint256) {
        // 12개 입력 → 3단계 Poseidon 해싱 (PoseidonT6: 5-input)
        uint256 h1 = PoseidonT6.hash([_msg[0], _msg[1], _msg[2], _msg[3], _msg[4]]);
        uint256 h2 = PoseidonT6.hash([_msg[5], _msg[6], _msg[7], _msg[8], _msg[9]]);
        return PoseidonT5.hash([h1, h2, _encPubKeyX, _encPubKeyY]);
    }
}
```

### 4.4 MessageProcessor.sol — State Transition 검증

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MessageProcessor {
    address public immutable poll;
    address public immutable verifier;
    address public immutable vkRegistry;

    uint256 public processedMessageCount;
    uint256 public currentStateCommitment;
    bool public processingComplete;

    event MessagesProcessed(uint256 newStateCommitment);

    constructor(address _poll, address _verifier, address _vkRegistry) {
        poll = _poll;
        verifier = _verifier;
        vkRegistry = _vkRegistry;
    }

    /// @notice 배치 메시지 처리 증명 검증
    /// @dev SHA256으로 압축된 public input 사용
    function processMessages(
        uint256 _newStateCommitment,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external {
        // 1. Poll이 Voting 종료 상태인지 확인
        require(!Poll(poll).isVotingOpen(), "Voting still open");

        // 2. AccQueue merge 완료 확인
        require(Poll(poll).stateAqMerged(), "State AQ not merged");
        require(Poll(poll).messageAqMerged(), "Message AQ not merged");

        // 3. Public inputs 구성 (SHA256 해시로 압축)
        //    SHA256(stateCommitment, messageRoot, numMessages, ...)
        //    → 단일 uint256으로 온체인 검증
        uint256 publicInputHash = uint256(sha256(abi.encodePacked(
            currentStateCommitment,
            _newStateCommitment,
            Poll(poll).messageAq().getMainRoot(),
            Poll(poll).numMessages()
        ))) % SNARK_SCALAR_FIELD;

        // 4. Groth16 검증
        uint256[] memory pubSignals = new uint256[](1);
        pubSignals[0] = publicInputHash;

        bool valid = IVerifier(verifier).verifyProof(_pA, _pB, _pC, pubSignals);
        require(valid, "Invalid process proof");

        // 5. State commitment 업데이트
        currentStateCommitment = _newStateCommitment;

        emit MessagesProcessed(_newStateCommitment);
    }
}
```

### 4.5 Tally.sol — 집계 검증

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Tally {
    address public immutable poll;
    address public immutable messageProcessor;
    address public immutable verifier;
    address public immutable vkRegistry;

    // Tally commitment: poseidon_3([votesRoot, totalSpent, perOptionSpent])
    uint256 public tallyCommitment;
    bool public tallyVerified;

    // 최종 결과
    uint256 public forVotes;
    uint256 public againstVotes;
    uint256 public abstainVotes;    // D1 only
    uint256 public totalVoters;

    event TallyPublished(
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        uint256 tallyCommitment
    );

    constructor(
        address _poll, address _mp, address _verifier, address _vkRegistry
    ) {
        poll = _poll;
        messageProcessor = _mp;
        verifier = _verifier;
        vkRegistry = _vkRegistry;
    }

    /// @notice 집계 배치 증명 검증
    function tallyVotes(
        uint256 _newTallyCommitment,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external {
        // 1. MessageProcessor가 처리 완료 상태인지 확인
        require(
            MessageProcessor(messageProcessor).processingComplete(),
            "Processing not done"
        );

        // 2. Public input hash (SHA256 압축)
        uint256 publicInputHash = uint256(sha256(abi.encodePacked(
            MessageProcessor(messageProcessor).currentStateCommitment(),
            tallyCommitment,
            _newTallyCommitment
        ))) % SNARK_SCALAR_FIELD;

        // 3. Groth16 검증
        uint256[] memory pubSignals = new uint256[](1);
        pubSignals[0] = publicInputHash;

        bool valid = IVerifier(verifier).verifyProof(_pA, _pB, _pC, pubSignals);
        require(valid, "Invalid tally proof");

        // 4. Tally commitment 업데이트
        tallyCommitment = _newTallyCommitment;
    }

    /// @notice 최종 결과 게시 (마지막 tallyVotes 후)
    function publishResults(
        uint256 _forVotes,
        uint256 _againstVotes,
        uint256 _abstainVotes,
        uint256 _totalVoters,
        uint256[][] calldata _tallyProof // Merkle proof
    ) external {
        // 결과가 tallyCommitment와 일치하는지 Merkle 검증
        // ...

        forVotes = _forVotes;
        againstVotes = _againstVotes;
        abstainVotes = _abstainVotes;
        totalVoters = _totalVoters;
        tallyVerified = true;

        emit TallyPublished(_forVotes, _againstVotes, _abstainVotes, tallyCommitment);
    }
}
```

### 4.6 AccQueue.sol — Quinary 누적 큐

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Quinary (5-ary) Accumulator Queue for on-chain Merkle tree management
/// @dev Enqueue leaves during voting, merge into final tree after voting ends
contract AccQueue {
    uint8 public immutable arity;      // 5 (quinary)
    uint8 public immutable depth;

    uint256 public numLeaves;

    // Subtree roots (intermediate merge results)
    uint256[] public subRoots;
    uint256 public mainRoot;
    bool public subTreesMerged;
    bool public merged;

    constructor(uint8 _arity, uint8 _depth) {
        arity = _arity;
        depth = _depth;
    }

    /// @notice 새 leaf 추가 (투표 기간 중)
    function enqueue(uint256 _leaf) external {
        numLeaves++;
        // Quinary subtree에 leaf 추가
        // subtree가 가득 차면 자동으로 subRoot 생성
        // ...
    }

    /// @notice Subtree roots 병합 (투표 종료 후)
    function mergeSubRoots(uint256 _numSrQueueOps) external {
        // 점진적 merge (가스 제한 고려)
        // ...
        subTreesMerged = true;
    }

    /// @notice 최종 root 확정
    function merge() external {
        require(subTreesMerged, "Sub-roots not merged");
        // 최종 Quinary Merkle root 계산
        // ...
        merged = true;
    }

    function getMainRoot() external view returns (uint256) {
        require(merged, "Not merged yet");
        return mainRoot;
    }
}
```

### 4.7 보조 컨트랙트

```solidity
// gatekeepers/ISignUpGatekeeper.sol
interface ISignUpGatekeeper {
    function register(address _user, bytes memory _data) external;
}

// gatekeepers/FreeForAllGatekeeper.sol
contract FreeForAllGatekeeper is ISignUpGatekeeper {
    function register(address, bytes memory) external override {
        // 무조건 통과 (제한 없음)
    }
}

// voiceCreditProxy/IVoiceCreditProxy.sol
interface IVoiceCreditProxy {
    function getVoiceCredits(address _user, bytes memory _data)
        external view returns (uint256);
}

// voiceCreditProxy/ConstantVoiceCreditProxy.sol
contract ConstantVoiceCreditProxy is IVoiceCreditProxy {
    uint256 public immutable creditAmount;

    constructor(uint256 _amount) { creditAmount = _amount; }

    function getVoiceCredits(address, bytes memory)
        external view override returns (uint256) {
        return creditAmount;
    }
}

// VkRegistry.sol — 검증키 레지스트리
contract VkRegistry {
    mapping(uint256 => uint256[]) public processVks;  // 회로별 검증키
    mapping(uint256 => uint256[]) public tallyVks;

    function setVerifyingKeys(
        uint256 _stateTreeDepth,
        uint256 _messageTreeDepth,
        uint256[] calldata _processVk,
        uint256[] calldata _tallyVk
    ) external {
        // 검증키 등록 (배포자만)
    }
}

// DomainObjs.sol — 공유 타입 정의
contract DomainObjs {
    uint256 internal constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
}
```

### 4.8 V1 vs V2 컨트랙트 매핑

| V1 함수 | V2 컨트랙트.함수 | 변경 이유 |
|---------|-----------------|----------|
| `registerVoter()` | `MACI.signUp()` | EdDSA pubkey + Gatekeeper |
| `createProposalD1/D2()` | `MACI.deployPoll()` | Poll 인스턴스 생성 |
| `castVoteD1/D2()` | `Poll.publishMessage()` | 암호화 메시지 제출 |
| `revealVoteD1/D2()` | **삭제** | Reveal 자체 제거 |
| (없음) | `Poll.mergeMaci*()` | AccQueue merge |
| (없음) | `MessageProcessor.processMessages()` | State transition |
| (없음) | `Tally.tallyVotes()` | 집계 검증 |
| `getProposalD1/D2()` | View functions (분산) | 컨트랙트 분리 |
| `getPhaseD1/D2()` | `Poll.isVotingOpen()` 등 | Phase 분리 |

---

## 5. ZK 회로 설계

### 5.1 MessageProcessor.circom — State Transition 검증

```circom
// 핵심 검증 로직 (의사코드)
template MessageProcessor(
    stateTreeDepth,    // Quinary state tree depth (10)
    messageTreeDepth,  // Quinary message tree depth
    voteOptionTreeDepth,
    batchSize           // 배치 크기
) {
    // === Public Inputs (SHA256 해시로 압축) ===
    signal input inputHash;  // SHA256(아래 모든 public inputs) % p

    // SHA256 내부에 포함되는 값들:
    //   - inputStateRoot        (처리 전 state root)
    //   - outputStateRoot       (처리 후 state root)
    //   - inputBallotRoot       (처리 전 ballot root)
    //   - outputBallotRoot      (처리 후 ballot root)
    //   - inputMessageRoot      (메시지 트리 root)
    //   - coordinatorPubKeyHash
    //   - batchStartIndex       (이 배치의 시작 인덱스)
    //   - batchEndIndex         (이 배치의 끝 인덱스)

    // === Private Inputs (per message in batch) ===
    signal input messages[batchSize][10];    // DuplexSponge 암호화 메시지
    signal input encPubKeys[batchSize][2];   // 임시 공개키
    signal input coordinatorSk;              // Coordinator 비밀키
    signal input stateLeaves[batchSize][4];  // [pkX, pkY, balance, timestamp]
    signal input ballots[batchSize];         // ballot hashes
    signal input stateProofs[batchSize][];   // Quinary Merkle proofs
    signal input messageProofs[batchSize][]; // Quinary Merkle proofs

    // === SHA256 Public Input 검증 ===
    component sha256Hasher = Sha256Hasher(numPublicInputFields);
    // ... inputHash === sha256(all_public_values) % p

    // === ★ 역순 처리 (마지막 메시지부터) ===
    // MACI 핵심: messages[0] = 가장 마지막 메시지
    //            messages[batchSize-1] = 가장 처음 메시지
    for (var i = 0; i < batchSize; i++) {
        // 1. ECDH 복호화 (Poseidon DuplexSponge)
        //    sharedKey = ECDH(coordinatorSk, encPubKeys[i])
        //    plaintext = DuplexSponge.decrypt(messages[i], sharedKey)
        component ecdh = Ecdh();
        ecdh.privKey <== coordinatorSk;
        ecdh.pubKey[0] <== encPubKeys[i][0];
        ecdh.pubKey[1] <== encPubKeys[i][1];

        component decrypt = PoseidonDuplexSpongeDecrypt(msgLength);
        decrypt.key[0] <== ecdh.sharedKey[0];
        decrypt.key[1] <== ecdh.sharedKey[1];
        // ...

        // 2. Command unpack (binary → fields)
        component unpack = UnpackCommand();
        // stateIndex, newPubKey, voteOption, weight, nonce, pollId, salt

        // 3. EdDSA 서명 검증
        component sigVerify = EdDSAPoseidonVerifier();
        // signature(R8, S) 검증 with current stateLeaf.pubKey

        // 4. 유효성 검증
        //    a. stateIndex < numSignUps
        //    b. nonce === ballot.nonce + 1
        //    c. voiceCreditBalance + (기존 weight)² - (새 weight)² >= 0
        //    d. voteWeight < sqrt(SNARK_FIELD)
        //    e. timestamp 유효
        //    f. voteOptionIndex < maxVoteOptions

        // 5. ★ 유효/무효 분기 (회로 내 증명)
        //    유효: state transition 적용
        //    무효: blank leaf (index 0)로 라우팅
        signal isValid;  // 모든 검증 AND

        // Mux: isValid ? stateIndex : 0
        signal targetIndex;
        targetIndex <== isValid * command.stateIndex;
        // → 무효 시 index 0 (blank leaf)에 적용

        // 6. State leaf 업데이트
        //    newLeaf = poseidon_4([newPubKeyX, newPubKeyY, newBalance, timestamp])

        // 7. Ballot 업데이트
        //    ballot.votes[voteOption] = newWeight
        //    ballot.nonce++
        //    newBallotHash = poseidon_2([newNonce, newVoteOptionRoot])

        // 8. Quinary State Tree root 재계산
        // 9. Quinary Ballot Tree root 재계산
    }

    // 10. 최종 state root, ballot root 검증
    //    computedOutputStateRoot === outputStateRoot
    //    computedOutputBallotRoot === outputBallotRoot
}
```

**예상 제약 수**: ~500K~1M constraints (batchSize에 따라)

### 5.2 TallyVotes.circom — 집계 검증

```circom
template TallyVotes(
    stateTreeDepth,
    voteOptionTreeDepth,
    batchSize
) {
    // === Public Inputs (SHA256 압축) ===
    signal input inputHash;  // SHA256(아래 모든 public inputs) % p

    // SHA256 내부:
    //   - stateCommitment      (최종 state commitment)
    //   - tallyCommitment      (이전 tally commitment)
    //   - newTallyCommitment   (업데이트된 tally commitment)
    //   - batchNum             (배치 번호)

    // === Private Inputs ===
    signal input stateLeaves[batchSize][4];  // [pkX, pkY, balance, timestamp]
    signal input ballots[batchSize];
    signal input voteWeights[batchSize][];   // per option weights
    signal input stateProofs[batchSize][];
    signal input currentTally[];
    signal input newTally[];

    // === Tally Logic ===
    for (var i = 0; i < batchSize; i++) {
        // 1. State leaf가 stateRoot에 포함 (Quinary Merkle proof)
        // 2. Ballot에서 각 option의 voteWeight 검증
        // 3. 집계: newTally[option] = currentTally[option] + voteWeight
    }

    // 4. Tally commitment 검증
    //    newTallyCommitment = poseidon_3([
    //      tallyResultsRoot,    // 옵션별 집계 Merkle root
    //      totalSpentVoiceCredits,
    //      perVoteOptionSpentRoot
    //    ])

    // 5. SHA256 input hash 검증
}
```

**예상 제약 수**: ~200K constraints

### 5.3 기존 회로 재사용

| 기존 회로 | V2에서의 역할 | 변경 |
|-----------|-------------|------|
| `PrivateVoting.circom` | signUp 시 자격 검증 (토큰 소유 증명) | **유지** |
| `D2_QuadraticVoting.circom` | D2 모드 credit 검증 | **유지** |
| `MerkleProof` template | **수정 필요** — Binary → Quinary Merkle proof | 5-ary로 확장 |
| `SecretToPublic` template | 키 소유권 증명 | **재사용** |

### 5.4 Quinary Merkle Proof template

```circom
// 기존 Binary MerkleProof → Quinary MerkleProof 확장
template QuinaryMerkleProof(depth) {
    signal input leaf;
    signal input path_index[depth];    // 0~4 (5-ary 위치)
    signal input path_elements[depth][4]; // 형제 노드 (5-1=4개)
    signal output root;

    component hashers[depth];

    for (var i = 0; i < depth; i++) {
        hashers[i] = Poseidon(5);  // PoseidonT6 (5-input)
        // path_index에 따라 5개 자식 중 올바른 위치에 current 배치
        // 나머지 4개는 path_elements에서 채움
    }
}
```

---

## 6. Coordinator 서비스 설계

### 6.1 디렉토리 구조

```
coordinator/
├── src/
│   ├── index.ts              # 메인 엔트리, 이벤트 리스너
│   ├── crypto/
│   │   ├── ecdh.ts           # ECDH 키 교환
│   │   ├── duplexSponge.ts   # Poseidon DuplexSponge 복호화
│   │   ├── eddsa.ts          # EdDSA 서명 검증
│   │   ├── blake512.ts       # BLAKE512 키 파생
│   │   └── sha256.ts         # SHA256 public input 해싱
│   ├── trees/
│   │   ├── quinaryTree.ts    # Quinary Merkle Tree
│   │   ├── stateTree.ts      # State Tree 관리
│   │   ├── ballotTree.ts     # Ballot Tree 관리
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

### 6.2 처리 시퀀스 (★ 역순 처리)

```typescript
// coordinator/src/processing/processMessages.ts

async function processAllMessages(
  coordinatorSk: bigint,
  messages: EncryptedMessage[],
  stateTree: QuinaryMerkleTree,
  ballotTree: QuinaryMerkleTree
): Promise<ProcessResult> {

  // ★★★ MACI 핵심: 역순 처리 (마지막 메시지부터) ★★★
  // Key Change 방어의 핵심. 정순 처리 시 매수 방어 약화.
  const reversed = [...messages].reverse();

  for (const msg of reversed) {
    // 1. ECDH 복호화 (Poseidon DuplexSponge)
    const sharedKey = ecdh(coordinatorSk, msg.encPubKey);
    const plaintext = poseidonDuplexSpongeDecrypt(msg.data, sharedKey);

    // 2. Command unpack (binary → fields)
    const command = unpackCommand(plaintext);

    // 3. State leaf 조회
    const stateLeaf = stateTree.getLeaf(command.stateIndex);

    // 4. 유효성 검증
    let isValid = true;

    // 4a. EdDSA 서명 검증
    const validSig = verifyEdDSA(
      hashCommand(command),
      plaintext.signature,
      [stateLeaf.pubKeyX, stateLeaf.pubKeyY]
    );
    if (!validSig) isValid = false;

    // 4b. Nonce 검증
    const ballot = ballotTree.getLeaf(command.stateIndex);
    if (command.nonce !== ballot.nonce + 1n) isValid = false;

    // 4c. Voice credit 검증
    const currentWeight = ballot.votes[Number(command.voteOptionIndex)] || 0n;
    const newWeight = command.newVoteWeight;
    const creditChange = (currentWeight * currentWeight) - (newWeight * newWeight);
    if (stateLeaf.voiceCreditBalance + creditChange < 0n) isValid = false;

    // 4d. 범위 검증
    if (command.stateIndex >= numSignUps) isValid = false;
    if (command.voteOptionIndex >= maxVoteOptions) isValid = false;

    // 5. ★ 유효/무효 분기 (MACI index 0 routing)
    if (isValid) {
      // 유효: State transition 적용

      // 5a. Key Change 처리
      if (command.newPubKeyX !== stateLeaf.pubKeyX ||
          command.newPubKeyY !== stateLeaf.pubKeyY) {
        stateLeaf.pubKeyX = command.newPubKeyX;
        stateLeaf.pubKeyY = command.newPubKeyY;
      }

      // 5b. Vote 처리
      stateLeaf.voiceCreditBalance += creditChange;
      ballot.votes[Number(command.voteOptionIndex)] = newWeight;
      ballot.nonce++;

      // 5c. State Tree & Ballot Tree 업데이트
      stateTree.update(command.stateIndex, hashStateLeaf(stateLeaf));
      ballotTree.update(command.stateIndex, hashBallot(ballot));

    } else {
      // ★ 무효: blank leaf (index 0)로 라우팅
      // command를 index 0의 blank state leaf에 적용
      // blank leaf는 충분한 credit을 가지므로 항상 "성공"
      // 하지만 실질적 영향 없음 (특수 pubKey)
      const blankLeaf = stateTree.getLeaf(0);
      stateTree.update(0, hashStateLeaf(blankLeaf)); // 실질 변경 없음
      ballotTree.update(0, hashBallot(ballotTree.getLeaf(0)));
    }
  }

  return {
    newStateRoot: stateTree.root,
    newBallotRoot: ballotTree.root
  };
}
```

### 6.3 Coordinator 전체 워크플로우

```typescript
// coordinator/src/index.ts

async function coordinatorWorkflow() {
  // 1. 투표 종료 감지 (블록 타임스탬프)
  await waitForVotingEnd(pollContract);

  // 2. AccQueue merge 실행
  await pollContract.mergeMaciStateAqSubRoots(0);
  await pollContract.mergeMaciStateAq();
  await pollContract.mergeMessageAqSubRoots(0);
  await pollContract.mergeMessageAq();

  // 3. 온체인 이벤트로 모든 메시지 수집
  const messages = await fetchAllMessages(pollContract);
  const signUps = await fetchAllSignUps(maciContract);

  // 4. 오프체인 트리 재구축
  const stateTree = rebuildStateTree(signUps);
  const ballotTree = initBallotTree(signUps.length);

  // 5. ★ 역순 메시지 처리 (배치)
  const batches = splitIntoBatches(messages, BATCH_SIZE);
  for (const batch of batches) {
    const result = await processMessageBatch(
      coordinatorSk, batch, stateTree, ballotTree
    );

    // 6. processMessages ZKP 생성
    const proof = await generateProcessProof(result);

    // 7. 온체인 제출
    await messageProcessorContract.processMessages(
      result.newStateCommitment,
      proof.pA, proof.pB, proof.pC
    );
  }

  // 8. Tally 계산 (배치)
  const tallyBatches = splitIntoBatches(stateTree.leaves, BATCH_SIZE);
  for (const batch of tallyBatches) {
    const tallyResult = tallyBatch(batch, ballotTree);

    // 9. tallyVotes ZKP 생성
    const proof = await generateTallyProof(tallyResult);

    // 10. 온체인 제출
    await tallyContract.tallyVotes(
      tallyResult.newTallyCommitment,
      proof.pA, proof.pB, proof.pC
    );
  }

  // 11. 최종 결과 게시
  await tallyContract.publishResults(
    forVotes, againstVotes, abstainVotes, totalVoters, tallyProof
  );
}
```

### 6.4 D1/D2 모드 분기

```typescript
function calculateCost(
  currentWeight: bigint,
  newWeight: bigint,
  mode: 'D1' | 'D2'
): bigint {
  if (mode === 'D1') {
    // D1: 1:1 비용. votingPower = noteValue
    return newWeight - currentWeight;
  } else {
    // D2: Quadratic. creditsSpent = newWeight² - currentWeight²
    return (newWeight * newWeight) - (currentWeight * currentWeight);
  }
}
```

---

## 7. 암호화 모듈 설계

### 7.1 ECDH 키 교환

```typescript
// src/crypto/ecdh.ts
import { buildBabyjub } from 'circomlibjs';

/**
 * ECDH 공유 비밀키 생성
 * 기존 Baby Jubjub 키 인프라 100% 재사용
 */
function generateECDHSharedKey(
  sk: bigint,
  otherPubKey: [bigint, bigint]
): bigint {
  const babyJub = await buildBabyjub();
  const sharedPoint = babyJub.mulPointEscalar(
    [otherPubKey[0], otherPubKey[1]],
    sk
  );
  return babyJub.F.toObject(sharedPoint[0]);
}
```

### 7.2 Poseidon DuplexSponge 암호화 (MACI 원본)

```typescript
// src/crypto/duplexSponge.ts
// MACI의 zk-kit 패키지 방식 — CTR 모드가 아닌 DuplexSponge

import { poseidon } from 'circomlibjs';

/**
 * Poseidon DuplexSponge 암호화
 * MACI 원본: https://github.com/privacy-scaling-explorations/maci/blob/main/crypto/ts/index.ts
 *
 * 차이점: 이전 Design의 CTR 모드 → DuplexSponge로 변경
 * CTR: ciphertext[i] = plaintext[i] + Poseidon(key, i)
 * DuplexSponge: Poseidon permutation을 sponge 구조로 사용
 */
function poseidonDuplexSpongeEncrypt(
  plaintext: bigint[],
  sharedKey: [bigint, bigint],  // ECDH shared key (x, y)
  nonce: bigint
): bigint[] {
  const ciphertext: bigint[] = [];

  // Sponge state 초기화
  let state = [sharedKey[0], sharedKey[1], nonce, 0n];

  for (let i = 0; i < plaintext.length; i++) {
    // Poseidon permutation
    state = poseidonPermutation(state);

    // Squeeze: ciphertext = plaintext XOR state
    ciphertext.push(plaintext[i] + state[0]);  // field addition

    // Absorb: 다음 라운드에 ciphertext 주입
    state[0] = ciphertext[i];
  }

  return ciphertext;
}

function poseidonDuplexSpongeDecrypt(
  ciphertext: bigint[],
  sharedKey: [bigint, bigint],
  nonce: bigint
): bigint[] {
  const plaintext: bigint[] = [];

  let state = [sharedKey[0], sharedKey[1], nonce, 0n];

  for (let i = 0; i < ciphertext.length; i++) {
    state = poseidonPermutation(state);
    plaintext.push(ciphertext[i] - state[0]);  // field subtraction
    state[0] = ciphertext[i];  // absorb ciphertext
  }

  return plaintext;
}
```

### 7.3 BLAKE512 키 파생 (MACI 원본)

```typescript
// src/crypto/blake512.ts
// MACI 원본: BLAKE2b-512 해싱 후 pruning (RFC 8032 스타일)

import { blake2b } from '@noble/hashes/blake2b';

/**
 * BLAKE512 키 파생 — MACI 원본과 동일
 * 임의의 시드에서 Baby Jubjub 유효한 스칼라 생성
 */
function derivePrivateKey(seed: Uint8Array): bigint {
  // 1. BLAKE2b-512 해시
  const hash = blake2b(seed, { dkLen: 64 });

  // 2. Pruning (RFC 8032 스타일)
  hash[0] &= 0xF8;    // 하위 3비트 클리어
  hash[31] &= 0x7F;   // 최상위 비트 클리어
  hash[31] |= 0x40;   // 두 번째 비트 셋

  // 3. Little-endian → bigint (하위 32바이트만)
  const sk = bytesToBigInt(hash.slice(0, 32));

  // 4. Baby Jubjub subgroup order로 모듈러
  return sk % BABY_JUBJUB_SUBORDER;
}
```

### 7.4 EdDSA 서명 (Poseidon 기반)

```typescript
// src/crypto/eddsa.ts
import { buildEddsa } from 'circomlibjs';

async function eddsaSign(
  message: bigint,
  privateKey: bigint
): Promise<EdDSASignature> {
  const eddsa = await buildEddsa();
  const signature = eddsa.signPoseidon(
    bigIntToBuffer(privateKey),
    eddsa.F.e(message)
  );
  return {
    R8: [eddsa.F.toObject(signature.R8[0]), eddsa.F.toObject(signature.R8[1])],
    S: signature.S
  };
}

async function eddsaVerify(
  message: bigint,
  signature: EdDSASignature,
  pubKey: [bigint, bigint]
): Promise<boolean> {
  const eddsa = await buildEddsa();
  return eddsa.verifyPoseidon(message, signature, pubKey);
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
    → MACI.sol State AccQueue에 poseidon_4([pk1X, pk1Y, balance, timestamp]) 추가
    → stateIndex = 5, ballot.nonce = 0

T2: Bob(매수자): "찬성에 투표해!"
    Alice: publishMessage(DuplexSponge.encrypt({
      stateIndex: 5,
      newPubKey: pk1,      // 키 변경 없음
      voteOption: 0,       // proposalId = 0
      voteWeight: 1,       // 찬성
      nonce: 1,
      pollId: 0,
      salt: random
    }, ECDH(ephSk, coordPk)))
    → Bob은 Alice가 투표한 것만 확인, 내용은 DuplexSponge 암호화

T3: Alice (혼자): publishMessage(DuplexSponge.encrypt({
      stateIndex: 5,
      newPubKey: pk2,      // ★ 키를 pk2로 변경!
      voteOption: 0,
      voteWeight: 0,       // 투표 리셋
      nonce: 2,
      pollId: 0,
      salt: random
    }, ECDH(ephSk2, coordPk)))
    → Bob은 이 메시지의 존재도 내용도 알 수 없음

T4: Alice (혼자): publishMessage(DuplexSponge.encrypt({
      stateIndex: 5,
      newPubKey: pk2,      // pk2 유지
      voteOption: 0,
      voteWeight: 1,       // 반대로 재투표
      nonce: 3,
      pollId: 0,
      salt: random
    }, ECDH(ephSk3, coordPk)))
    → 최종 투표: 반대

★ Coordinator 역순 처리:
  msg3 (T4): pk2로 서명 유효, nonce=3 유효 → 반대 기록
  msg2 (T3): pk1로 서명 유효, nonce=2 유효 → 키 변경 pk1→pk2, 리셋
  msg1 (T2): pk1로 서명... 이미 pk2로 변경됨 → 무효 → index 0 라우팅

결과: Alice의 최종 투표 = 반대
Bob은 pk1 알아도 msg3/msg4는 복호화 불가 (다른 ephemeral key)
→ 매수 실패
```

### 8.2 유효성 규칙 (MACI 완전 반영)

```
메시지 유효 조건 (모두 충족해야 함):
1. stateIndex < numSignUps (범위 유효)
2. EdDSA 서명이 현재 state leaf의 pubKey로 유효
3. nonce === ballot.nonce + 1
4. voiceCreditBalance + (currentWeight² - newWeight²) >= 0
5. voteOptionIndex < maxVoteOptions
6. newVoteWeight < sqrt(SNARK_SCALAR_FIELD) (오버플로 방지)
7. timestamp 유효 (등록 시점 이후)

무효 메시지 처리 (★ MACI 핵심):
- Coordinator가 단순 "스킵"이 아님!
- 회로 내에서 command를 index 0 (blank state leaf)로 라우팅
- blank leaf는 충분한 credit + 특수 pubKey를 가짐
- 따라서 어떤 command든 "적용"은 되지만 실질 영향 없음
- 이 라우팅 자체를 ZKP로 증명 → Coordinator가 임의 처리 불가
```

---

## 9. 프론트엔드 설계

### 9.1 Phase별 UI 매핑 (V2)

| Phase | UI 컴포넌트 | 주요 액션 |
|-------|------------|----------|
| 0 (Voting) | `VoteFormV2.tsx` | 투표 (DuplexSponge 암호화 전송) |
| 1 (Merging) | `MergingStatus.tsx` | "AccQueue 병합 중" 대기 |
| 2 (Processing) | `ProcessingStatus.tsx` | "집계 진행 중" 대기 |
| 3 (Finalized) | `VoteResult.tsx` | 결과 조회 |

### 9.2 컴포넌트 구조 (V2)

```
src/components/
├── QuadraticVotingDemo.tsx       # 메인 (V2 모드 추가)
├── voting/
│   ├── VoteFormV2.tsx            # DuplexSponge 암호화 투표 폼 (NEW)
│   ├── MergingStatus.tsx         # AccQueue merge 대기 UI (NEW)
│   ├── ProcessingStatus.tsx      # 집계 대기 UI (NEW)
│   ├── VoteResult.tsx            # 결과 (기존 확장)
│   ├── PhaseIndicator.tsx        # Phase 표시 (V2 적응)
│   └── KeyManager.tsx            # 키 변경 UI (NEW)
│   ├── RevealForm.tsx            # DEPRECATED (V2에서 삭제)
```

### 9.3 VoteFormV2 데이터 흐름

```typescript
async function handleVoteV2(proposalId: bigint, choice: number, weight: bigint) {
  // 1. BLAKE512 키 파생으로 EdDSA 키 로드
  const { sk, pkX, pkY } = getOrCreateKeyPair(walletAddress);

  // 2. Command 구성 (binary-packed)
  const command: Command = {
    stateIndex: myStateIndex,
    newPubKeyX: pkX,
    newPubKeyY: pkY,
    voteOptionIndex: proposalId,
    newVoteWeight: weight,
    nonce: currentBallotNonce + 1n,
    pollId: currentPollId,
    salt: randomSalt()
  };

  // 3. Command hash + EdDSA 서명
  const cmdHash = hashCommand(command);  // poseidon_4([packed, pkX, pkY, salt])
  const signature = await eddsaSign(cmdHash, sk);

  // 4. ECDH 암호화 (Poseidon DuplexSponge)
  const ephemeralSk = derivePrivateKey(randomBytes(32));  // BLAKE512
  const ephemeralPk = derivePublicKey(ephemeralSk);
  const sharedKey = generateECDHSharedKey(ephemeralSk, [coordPubKeyX, coordPubKeyY]);

  const plaintext = [...packCommand(command), signature.R8[0], signature.R8[1], signature.S];
  const encMessage = poseidonDuplexSpongeEncrypt(plaintext, sharedKey, 0n);

  // 5. 온체인 제출 (Poll.sol)
  await writeContract({
    address: POLL_ADDRESS,
    abi: POLL_ABI,
    functionName: 'publishMessage',
    args: [encMessage, ephemeralPk[0], ephemeralPk[1]]
  });

  // 6. localStorage에 nonce만 저장 (Reveal 데이터 불필요!)
  saveBallotNonce(walletAddress, proposalId, currentBallotNonce + 1n);
}
```

---

## 10. 에러 처리

### 10.1 V2 에러 매핑

| 컨트랙트 | 에러 | 사용자 메시지 |
|----------|------|-------------|
| Poll | VotingEnded | 투표 기간이 종료되었습니다 |
| MessageProcessor | VotingStillOpen | 아직 투표 기간입니다 |
| MessageProcessor | StateAqNotMerged | State 트리 병합이 완료되지 않았습니다 |
| MessageProcessor | InvalidProcessProof | 메시지 처리 증명이 유효하지 않습니다 |
| Tally | ProcessingNotDone | 메시지 처리가 완료되지 않았습니다 |
| Tally | InvalidTallyProof | 집계 증명이 유효하지 않습니다 |

### 10.2 Coordinator 장애 대응

| 상황 | 대응 |
|------|------|
| Coordinator 미응답 | processDeadline 이후 대체 Coordinator 지정 가능 |
| 잘못된 증명 제출 | 온체인 verifier가 revert |
| 부분 처리 | 여러 번 processMessages 호출 (배치) |
| AccQueue merge 가스 부족 | 점진적 merge (numSrQueueOps 조절) |

---

## 11. 구현 순서 (MACI 분리 패턴 반영)

### Step 1: 암호화 인프라 (의존성 없음)
- `src/crypto/ecdh.ts` — ECDH 키 교환
- `src/crypto/duplexSponge.ts` — Poseidon DuplexSponge 암호화
- `src/crypto/eddsa.ts` — EdDSA-Poseidon 서명
- `src/crypto/blake512.ts` — BLAKE512 키 파생
- 단위 테스트 작성

### Step 2: AccQueue + Quinary Tree 컨트랙트 (의존성 없음)
- `contracts/AccQueue.sol` — Quinary AccQueue
- `contracts/PoseidonT3.sol` — 2-input Poseidon
- `contracts/PoseidonT6.sol` — 5-input Poseidon
- Forge 테스트

### Step 3: MACI 분리 컨트랙트 (Step 2 의존)
- `contracts/MACI.sol` — signUp + deployPoll
- `contracts/Poll.sol` — publishMessage + AccQueue merge
- `contracts/MessageProcessor.sol` — processMessages
- `contracts/Tally.sol` — tallyVotes + publishResults
- `contracts/VkRegistry.sol` — 검증키 관리
- `contracts/gatekeepers/` — FreeForAllGatekeeper
- `contracts/voiceCreditProxy/` — ConstantVoiceCreditProxy
- `contracts/DomainObjs.sol` — 공유 타입
- Forge 테스트 (mock verifier)

### Step 4: MessageProcessor 회로 (Step 1, 3 의존)
- `circuits/MessageProcessor.circom` — 역순 처리, index 0 라우팅, DuplexSponge
- `circuits/utils/quinaryMerkleProof.circom` — Quinary Merkle proof
- `circuits/utils/duplexSponge.circom` — DuplexSponge circom
- `circuits/utils/sha256Hasher.circom` — SHA256 public input 압축
- Circom 컴파일 + witness 테스트

### Step 5: TallyVotes 회로 (Step 4 의존)
- `circuits/TallyVotes.circom` — tally commitment 3-input
- Circom 컴파일 + witness 테스트

### Step 6: Coordinator 서비스 (Step 3, 4, 5 의존)
- 이벤트 리스너 + 역순 메시지 처리 + AccQueue merge + 증명 생성 + 온체인 제출
- 통합 테스트

### Step 7: 프론트엔드 V2 (Step 3, 6 의존)
- VoteFormV2, MergingStatus, ProcessingStatus, KeyManager
- E2E 테스트

### Step 8: Key Change 확장 (Step 4 의존)
- MessageProcessor에 key change 로직 추가
- Anti-coercion 시나리오 테스트

---

## 12. 테스트 계획

### 12.1 컨트랙트 테스트 (Forge)

| # | 테스트 | 검증 내용 |
|:-:|--------|----------|
| 1 | `test_MACI_SignUp` | 등록 → stateIndex 발급, State AccQueue 업데이트 |
| 2 | `test_MACI_SignUp_Gatekeeper` | Gatekeeper 검증 실패 → revert |
| 3 | `test_Poll_PublishMessage` | 암호화 메시지 → Message AccQueue 업데이트 |
| 4 | `test_Poll_PublishMessage_AfterVoting` | 투표 종료 후 → revert |
| 5 | `test_Poll_MergeAccQueues` | AccQueue merge 후 root 확정 |
| 6 | `test_MessageProcessor_Process` | 유효 proof → state commitment 업데이트 |
| 7 | `test_MessageProcessor_InvalidProof` | 잘못된 proof → revert |
| 8 | `test_MessageProcessor_NotMerged` | merge 전 process → revert |
| 9 | `test_Tally_TallyVotes` | 유효 proof → tally commitment 업데이트 |
| 10 | `test_Tally_InvalidProof` | 잘못된 proof → revert |
| 11 | `test_Tally_PublishResults` | 결과 게시 + Merkle 검증 |
| 12 | `test_NoRevealFunction` | 모든 컨트랙트 ABI에 reveal 함수 부재 |
| 13 | `test_IntegrationFlow` | signUp → publish → merge → process → tally 전체 |

### 12.2 회로 테스트

| # | 테스트 | 검증 내용 |
|:-:|--------|----------|
| 1 | DuplexSponge 암/복호화 | encrypt → decrypt 라운드트립 |
| 2 | EdDSA 서명 검증 | 유효 서명 통과, 무효 서명 실패 |
| 3 | ★ 역순 처리 정확성 | 마지막→처음 순서로 state 변경 |
| 4 | ★ 무효 → index 0 라우팅 | 무효 command가 blank leaf에 적용 |
| 5 | Key Change 반영 | 키 변경 후 이전 키 서명 무효 |
| 6 | Quinary Merkle proof | 5-ary tree inclusion 검증 |
| 7 | SHA256 public input | 온체인 sha256 == 회로 내 sha256 |
| 8 | Tally commitment | poseidon_3([votesRoot, totalSpent, perOptionSpent]) |

### 12.3 MACI 7대 속성 검증 테스트

| # | MACI 속성 | 시나리오 | 기대 결과 |
|:-:|----------|---------|----------|
| 1 | **Collusion Resistance** | 매수자가 투표 확인 시도 | DuplexSponge 암호화로 불가 |
| 2 | **Receipt-freeness** | 강압 투표 후 Key Change + 재투표 | 역순 처리 → 재투표가 최종 |
| 3 | **Privacy** | 온체인 데이터에서 choice 추출 시도 | ABI에 reveal 없음, 이벤트에 평문 없음 |
| 4 | **Uncensorability** | Coordinator가 투표 누락 시도 | AccQueue 포함 후 미처리 → proof 실패 |
| 5 | **Unforgeability** | 잘못된 EdDSA 서명 메시지 | → index 0 라우팅 (회로 증명) |
| 6 | **Non-repudiation** | 동일 stateIndex 재투표 | 이전 투표 대체 (삭제 불가) |
| 7 | **Correct Execution** | 잘못된 tally proof 제출 | → revert (온체인 검증) |

---

## 13. 파일별 변경 사항

### 13.1 신규 생성

| 파일 | LOC 예상 | 목적 |
|------|:--------:|------|
| `contracts/MACI.sol` | ~200 | 등록 + Poll 배포 |
| `contracts/Poll.sol` | ~250 | 투표 + AccQueue merge |
| `contracts/MessageProcessor.sol` | ~150 | State transition 검증 |
| `contracts/Tally.sol` | ~200 | 집계 검증 + 결과 게시 |
| `contracts/AccQueue.sol` | ~300 | Quinary 누적 큐 |
| `contracts/VkRegistry.sol` | ~80 | 검증키 관리 |
| `contracts/gatekeepers/*.sol` | ~30 | 등록 제한 |
| `contracts/voiceCreditProxy/*.sol` | ~30 | Credit 할당 |
| `contracts/DomainObjs.sol` | ~20 | 공유 상수 |
| `contracts/PoseidonT3.sol` | ~700 | 2-input Poseidon |
| `contracts/PoseidonT6.sol` | ~700 | 5-input Poseidon |
| `circuits/MessageProcessor.circom` | ~400 | 역순 처리 + index 0 + DuplexSponge |
| `circuits/TallyVotes.circom` | ~200 | tally commitment 3-input |
| `circuits/utils/quinaryMerkleProof.circom` | ~60 | 5-ary Merkle proof |
| `circuits/utils/duplexSponge.circom` | ~80 | DuplexSponge circom |
| `circuits/utils/sha256Hasher.circom` | ~40 | SHA256 해싱 |
| `coordinator/src/**` | ~1200 | Coordinator 서비스 전체 |
| `src/crypto/ecdh.ts` | ~60 | ECDH 모듈 |
| `src/crypto/duplexSponge.ts` | ~80 | DuplexSponge 모듈 |
| `src/crypto/eddsa.ts` | ~60 | EdDSA 모듈 |
| `src/crypto/blake512.ts` | ~40 | BLAKE512 키 파생 |
| `src/components/voting/VoteFormV2.tsx` | ~200 | 암호화 투표 폼 |
| `src/components/voting/MergingStatus.tsx` | ~60 | AccQueue merge 대기 |
| `src/components/voting/ProcessingStatus.tsx` | ~80 | 집계 대기 UI |
| `src/components/voting/KeyManager.tsx` | ~150 | 키 관리 UI |
| `test/MACI.t.sol` | ~300 | MACI 테스트 |
| `test/Poll.t.sol` | ~300 | Poll 테스트 |

### 13.2 수정

| 파일 | 변경 내용 | 위험도 |
|------|----------|:------:|
| `src/components/QuadraticVotingDemo.tsx` | V2 모드 분기, Phase 변경 | 높음 |
| `src/zkproof.ts` | ECDH/EdDSA/DuplexSponge import | 높음 |
| `src/contract.ts` | V2 컨트랙트 ABI/주소 추가 | 중 |
| `src/components/voting/PhaseIndicator.tsx` | V2 Phase (4단계) | 낮음 |
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
| 2026-02-13 | AI | MACI 100% 반영 업데이트: 4-input State Leaf, Ballot 분리, binary-packed Command, DuplexSponge, Quinary+AccQueue, MACI 분리 컨트랙트, 역순 처리, index 0 라우팅, SHA256 압축, BLAKE512 키 파생, tally commitment 3-input |
