# System Architecture

## Overview

zkDEX D1 Private Voting은 [D1 스펙](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)을 구현한 영지식 증명 기반 비밀 투표 시스템입니다.

## System Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              D1 PRIVATE VOTING                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                           USER INTERFACE                              │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │  │
│  │  │  Proposals  │───▶│  Commit     │───▶│   Reveal    │              │  │
│  │  │    List     │    │   Phase     │    │   Phase     │              │  │
│  │  └─────────────┘    └──────┬──────┘    └──────┬──────┘              │  │
│  └───────────────────────────┼───────────────────┼──────────────────────┘  │
│                              │                   │                          │
│  ┌───────────────────────────▼───────────────────▼──────────────────────┐  │
│  │                         ZK PROOF MODULE                               │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │  │
│  │  │  Key Mgmt   │    │   Merkle    │    │   Proof     │              │  │
│  │  │  (BabyJub)  │    │    Tree     │    │  Generation │              │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────▼────────────────────────────────────┐  │
│  │                         SMART CONTRACT                                │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │  │
│  │  │  Verifier   │    │  Proposal   │    │  Nullifier  │              │  │
│  │  │  (Groth16)  │    │   Storage   │    │   Tracking  │              │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│  ┌─────────────────────────────────▼────────────────────────────────────┐  │
│  │                           BLOCKCHAIN                                  │  │
│  │                      Ethereum Sepolia Testnet                         │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## ZK Circuit Architecture

D1 스펙에 따른 6단계 검증 회로:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PrivateVoting.circom (~150K constraints)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PUBLIC INPUTS (4)                    PRIVATE INPUTS                        │
│  ┌─────────────────┐                  ┌─────────────────────────────────┐  │
│  │ voteCommitment  │                  │ sk, pkX, pkY                    │  │
│  │ proposalId      │                  │ noteHash, noteValue, noteSalt   │  │
│  │ votingPower     │                  │ tokenType, choice, voteSalt     │  │
│  │ merkleRoot      │                  │ merklePath[20], merkleIndex     │  │
│  └────────┬────────┘                  └───────────────┬─────────────────┘  │
│           │                                           │                      │
│           └────────────────────┬──────────────────────┘                      │
│                                │                                             │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐  │
│  │ Stage 1: Token Note Verification                                       │  │
│  │ noteHash === Poseidon(pkX, pkY, noteValue, tokenType, noteSalt)       │  │
│  └─────────────────────────────┬─────────────────────────────────────────┘  │
│                                │                                             │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐  │
│  │ Stage 2: Snapshot Inclusion (20-level Merkle Proof)                    │  │
│  │ MerkleProof(noteHash, merklePath, merkleIndex) === merkleRoot         │  │
│  └─────────────────────────────┬─────────────────────────────────────────┘  │
│                                │                                             │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐  │
│  │ Stage 3: Ownership Proof (Baby Jubjub)                                 │  │
│  │ BabyPbk(sk) === (pkX, pkY)                                            │  │
│  └─────────────────────────────┬─────────────────────────────────────────┘  │
│                                │                                             │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐  │
│  │ Stage 4: Power Matching                                                │  │
│  │ votingPower === noteValue                                             │  │
│  └─────────────────────────────┬─────────────────────────────────────────┘  │
│                                │                                             │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐  │
│  │ Stage 5: Choice Validation                                             │  │
│  │ choice ∈ {0, 1, 2}  (against, for, abstain)                           │  │
│  └─────────────────────────────┬─────────────────────────────────────────┘  │
│                                │                                             │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐  │
│  │ Stage 6: Commitment Binding                                            │  │
│  │ voteCommitment === Poseidon(choice, votingPower, proposalId, voteSalt)│  │
│  └─────────────────────────────┬─────────────────────────────────────────┘  │
│                                │                                             │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐  │
│  │ Nullifier Computation (passed separately)                              │  │
│  │ nullifier = Poseidon(sk, proposalId)                                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Commit-Reveal Flow

```
┌────────────┐         ┌────────────┐         ┌────────────┐         ┌────────────┐
│  PROPOSAL  │         │   COMMIT   │         │   REVEAL   │         │   TALLY    │
│  CREATED   │────────▶│   PHASE    │────────▶│   PHASE    │────────▶│  RESULTS   │
└────────────┘         └────────────┘         └────────────┘         └────────────┘
                             │                      │
                             ▼                      ▼
                       ┌──────────┐           ┌──────────┐
                       │ Generate │           │  Reveal  │
                       │ ZK Proof │           │ choice + │
                       │ + Submit │           │   salt   │
                       │commitment│           └──────────┘
                       └──────────┘
```

### Commit Phase

1. 사용자가 투표 선택 (For/Against/Abstain)
2. ZK 증명 생성:
   - 토큰 소유권 증명
   - 머클 트리 포함 증명
   - 투표권 일치 증명
3. commitment + nullifier + proof 제출
4. 컨트랙트가 증명 검증 및 저장

### Reveal Phase

1. Commit phase 종료 후
2. 사용자가 choice + voteSalt 공개
3. 컨트랙트가 commitment 재계산하여 검증
4. 투표 집계

## Component Structure

```
src/
├── App.tsx                 # Main UI Component
│   ├── Header              # Navigation + Wallet
│   ├── ProposalList        # Proposal cards
│   ├── ProposalDetail      # Voting interface
│   │   ├── CommitPhase     # ZK proof generation
│   │   └── RevealPhase     # Vote reveal
│   └── MyVotes             # Vote history
│
├── zkproof.ts              # ZK Proof Module
│   ├── getOrCreateKeyPair  # Baby Jubjub key management
│   ├── createTokenNote     # Note hash computation
│   ├── buildMerkleTree     # 20-level tree construction
│   ├── generateMerkleProof # Merkle proof generation
│   ├── prepareVote         # Commitment + nullifier
│   └── generateVoteProof   # Groth16 proof (simulated)
│
├── contract.ts             # Contract ABI + Address
└── wagmi.ts                # Wallet Configuration
```

## Data Flow

### State Management

| State | Type | Description |
|-------|------|-------------|
| `keyPair` | KeyPair | 사용자의 ZK 키페어 (sk, pkX, pkY) |
| `tokenNote` | TokenNote | 토큰 노트 (noteHash, noteValue, etc.) |
| `voteData` | VoteData | 투표 데이터 (commitment, nullifier) |
| `phase` | string | commit / reveal / ended |
| `proposals` | Proposal[] | 제안 목록 |

### Voting Data Structure

```typescript
interface VoteData {
  choice: 0n | 1n | 2n       // against / for / abstain
  votingPower: bigint        // Token balance
  voteSalt: bigint           // Random salt
  proposalId: bigint
  commitment: bigint         // hash(choice, votingPower, proposalId, voteSalt)
  nullifier: bigint          // hash(sk, proposalId)
}
```

## Smart Contract Architecture

```solidity
contract PrivateVoting {
    // Verifier interface (4 public inputs)
    IVerifier public verifier;

    // Proposal storage
    mapping(uint256 => Proposal) public proposals;

    // Vote commitments: proposalId => nullifier => VoteCommitment
    mapping(uint256 => mapping(uint256 => VoteCommitment)) public commitments;

    // Nullifier tracking: proposalId => nullifier => used
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

    // Merkle root registry
    mapping(uint256 => bool) public validMerkleRoots;

    // Core functions
    function commitVote(proposalId, commitment, votingPower, nullifier, proof)
    function revealVote(proposalId, nullifier, choice, voteSalt)
    function getProposal(proposalId) returns (...)
}
```

## Security Properties

| Property | Implementation |
|----------|----------------|
| Privacy | 투표 선택이 reveal phase까지 숨겨짐 |
| Anti-Coercion | Commit-reveal로 투표 증명 불가 |
| Double-Spend | nullifier = hash(sk, proposalId)로 방지 |
| Integrity | ZK proof로 토큰 소유권 검증 |

## Network Configuration

| Network | Chain ID | Contract |
|---------|----------|----------|
| Sepolia | 11155111 | `0x583e8926F8701a196F182c449dF7BAc4782EF784` |

## Future Enhancements

1. **Real Groth16 Proofs**: snarkjs 연동하여 실제 증명 생성
2. **Merkle Tree Service**: 토큰 스냅샷 자동화
3. **IPFS**: 제안 내용 분산 저장
4. **Multi-chain**: L2 네트워크 지원
