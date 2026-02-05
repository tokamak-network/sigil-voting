# ZK Private Voting - D1 Specification Implementation

## 프로젝트 개요

**회사**: Tokamak Network (https://www.tokamak.network/)
**프로젝트**: zkDEX D1 Private Voting
**목적**: Operation Spear Track B 과제 - 2주 내 완결된 성과물

---

## D1 스펙 준수

이 프로젝트는 [zkDEX D1 Private Voting 스펙](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)을 **정확히** 구현합니다.

### 핵심 보안 속성

| 속성 | 설명 |
|------|------|
| Privacy | 투표 선택이 reveal phase까지 숨겨짐 |
| Anti-Coercion | 투표자가 자신의 선택을 제3자에게 증명할 수 없음 |
| Double-Spend Prevention | `nullifier = hash(sk, proposalId)`로 재사용 방지 |

---

## 기술 구현

### ZK 회로 (circuits/PrivateVoting.circom)

**제약 수**: ~150K constraints
**Merkle Tree 깊이**: 20 levels (~1M leaves 지원)

#### 공개 입력값 (4개, D1 스펙 준수)

```circom
signal input voteCommitment;    // 투표 커밋먼트
signal input proposalId;        // 제안 ID
signal input votingPower;       // 투표권
signal input merkleRoot;        // 스냅샷 머클 루트
```

#### 비공개 입력값

```circom
signal input sk;                // 비밀키
signal input pkX, pkY;          // 공개키 (Baby Jubjub)
signal input noteHash;          // 토큰 노트 해시
signal input noteValue;         // 토큰 잔액
signal input noteSalt;          // 노트 랜덤값
signal input tokenType;         // 토큰 타입 ID
signal input choice;            // 투표 선택 (0/1/2)
signal input voteSalt;          // 투표 랜덤값
signal input merklePath[20];    // 머클 증명
signal input merkleIndex;       // 트리 내 위치 (단일 uint)
```

#### 6단계 검증 로직

| 단계 | 검증 내용 | 수식 |
|------|----------|------|
| 1 | Token Note 검증 | `noteHash = Poseidon(pkX, pkY, noteValue, tokenType, noteSalt)` |
| 2 | Snapshot 포함 증명 | 20-level Merkle proof 검증 |
| 3 | 소유권 증명 | Baby Jubjub: `sk → (pkX, pkY)` |
| 4 | 투표권 일치 | `votingPower === noteValue` |
| 5 | 선택 유효성 | `choice ∈ {0, 1, 2}` |
| 6 | 커밋먼트 바인딩 | `commitment = Poseidon(choice, votingPower, proposalId, voteSalt)` |

### 스마트 컨트랙트 (contracts/PrivateVoting.sol)

#### Verifier 인터페이스

```solidity
interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals  // 4개의 공개 입력
    ) external view returns (bool);
}
```

#### 투표 플로우

```
1. Commit Phase
   - commitVote(proposalId, commitment, votingPower, nullifier, proof)
   - ZK proof 검증
   - nullifier 사용 표시
   - commitment 저장

2. Reveal Phase
   - revealVote(proposalId, nullifier, choice, voteSalt)
   - commitment 재계산 및 검증
   - 투표 집계
```

### 프론트엔드 모듈 (src/zkproof.ts)

#### 주요 함수

| 함수 | 설명 |
|------|------|
| `getOrCreateKeyPair()` | 키페어 생성/복원 |
| `createTokenNote()` | 토큰 노트 생성 (D1 스펙 해시) |
| `buildMerkleTree()` | 20-level 머클 트리 구축 |
| `generateMerkleProof()` | 머클 증명 생성 (index는 단일 uint) |
| `computeCommitment()` | `hash(choice, votingPower, proposalId, voteSalt)` |
| `computeNullifier()` | `hash(sk, proposalId)` |
| `generateVoteProof()` | ZK 증명 생성 |

---

## 파일 구조

```
zk-dex-d1-private-voting/
├── circuits/
│   ├── PrivateVoting.circom   # D1 스펙 ZK 회로
│   └── compile.sh             # 컴파일 스크립트
├── contracts/
│   └── PrivateVoting.sol      # 커밋-리빌 컨트랙트
├── src/
│   ├── App.tsx                # 메인 UI (커밋-리빌 플로우)
│   ├── App.css                # 스타일
│   ├── contract.ts            # ABI & 주소
│   ├── zkproof.ts             # ZK 증명 모듈
│   └── wagmi.ts               # 지갑 설정
├── test/
│   └── PrivateVoting.test.ts  # 컨트랙트 테스트
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   └── TESTING.md
├── README.md
└── PROJECT_INFO.md            # 이 파일
```

---

## 실행 방법

### 프론트엔드

```bash
npm install
npm run dev
# http://localhost:5173
```

### ZK 회로 컴파일 (선택)

```bash
cd circuits
./compile.sh
```

**필요 도구**:
- [circom 2.1.6+](https://docs.circom.io/getting-started/installation/)
- [snarkjs](https://github.com/iden3/snarkjs)

### 컨트랙트 테스트

```bash
npx hardhat test
```

---

## 스펙 대조표

| D1 스펙 항목 | 구현 상태 | 파일 |
|-------------|----------|------|
| 4 public inputs | ✅ | circuit, contract |
| Token note hash (5 params) | ✅ | circuit:95-100 |
| 20-level Merkle proof | ✅ | circuit:25-54 |
| Baby Jubjub key derivation | ✅ | circuit:56-67 |
| Power matching | ✅ | circuit:128 |
| Choice validation (0,1,2) | ✅ | circuit:130-147 |
| Commitment binding (4 params) | ✅ | circuit:149-158 |
| Nullifier = hash(sk, proposalId) | ✅ | circuit:160-168 |
| merkleIndex as single uint | ✅ | circuit:28, 91 |

---

## 경쟁사 비교

| 기능 | 이 구현 | Snapshot | Tally | Vocdoni |
|------|---------|----------|-------|---------|
| Privacy (투표 숨김) | ✅ ZK | ❌ | ✅ | ✅ |
| Anti-Coercion | ✅ Commit-Reveal | ❌ | ❌ | ❌ |
| Token Ownership Proof | ✅ Merkle | ✅ | ✅ | ✅ |
| Double-Spend Prevention | ✅ Nullifier | ❌ | ✅ | ✅ |
| On-chain Verification | ✅ Groth16 | ❌ | ❌ | ❌ |

---

## 유즈케이스

- **프로토콜 매개변수 변경** - 이자율, 수수료 등
- **재무 보조금 결정** - 민감한 자금 배분
- **논쟁적 결정** - 소셜 압력 없이 투표
- **이사회 선거** - 익명 투표

---

## 참고 문서

- [D1 Private Voting 스펙 (영문)](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
- [D1 Private Voting 스펙 (한글)](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future_ko/circuit-addons/d-governance/d1-private-voting.md)
- [zkDEX 전체 문서](https://github.com/tokamak-network/zk-dex/tree/circom/docs/future)
- [Tokamak Network](https://tokamak.network)
- [circomlib](https://github.com/iden3/circomlib)
- [snarkjs](https://github.com/iden3/snarkjs)

---

## Tokamak Network 정보

### 회사 개요

- **개발사**: Onther Inc. (한국)
- **운영법인**: Tokamak Network Pte. Ltd. (싱가포르)
- **CEO**: Kevin Jeong (정순형)
- **핵심 제품**: Rollup Hub (L2 배포 플랫폼)

### 기술 스택

- Thanos Stack (OP Stack v1.7.7 포크)
- zk-EVM 개발 중
- zkDEX 100개 아이디어 개발 중

### 토큰 (TON)

- 컨트랙트: `0x2be5e8c109e2197D077D13A82dAead6a9b3433C5`
- 총 공급량: ~100M TON
