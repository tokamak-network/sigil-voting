# Testing Guide

## Overview

zkDEX D1 Private Voting 테스트 가이드입니다.

## Prerequisites

1. **Node.js 18+** 설치
2. **Web3 지갑** (MetaMask 권장)
3. **Sepolia ETH** (가스비용)

### Optional (ZK Circuit 컴파일)

4. **circom 2.1.6+** 설치
5. **snarkjs** 설치

## Quick Start

### 1. 개발 서버 실행

```bash
cd zk-dex-d1-private-voting
npm install
npm run dev
```

### 2. 브라우저 접속

```
http://localhost:5173
```

## Test Scenarios

### Test 1: Wallet Connection

| Step | Action | Expected |
|------|--------|----------|
| 1 | "Connect Wallet" 클릭 | 지갑 선택 모달 |
| 2 | MetaMask 선택 | MetaMask 팝업 |
| 3 | 연결 승인 | 주소 표시됨 |
| 4 | 네트워크 확인 | Sepolia |

### Test 2: ZK Key Generation

| Step | Action | Expected |
|------|--------|----------|
| 1 | 페이지 로드 | 자동 키 생성 |
| 2 | 콘솔 확인 | KeyPair 로그 |
| 3 | LocalStorage 확인 | `zk-vote-secret-key` 저장됨 |

**확인 코드:**
```javascript
// Browser console
localStorage.getItem('zk-vote-secret-key')
```

### Test 3: Commit Phase

| Step | Action | Expected |
|------|--------|----------|
| 1 | 제안 선택 | 상세 페이지 이동 |
| 2 | 투표 선택 (For/Against/Abstain) | 버튼 하이라이트 |
| 3 | "Generate ZK Proof" 클릭 | 진행률 표시 |
| 4 | 증명 완료 | commitment, nullifier 표시 |
| 5 | "Submit Vote" 클릭 | MetaMask 팝업 |
| 6 | 트랜잭션 승인 | Etherscan 링크 표시 |

**검증할 데이터:**

```typescript
// D1 스펙 준수 확인
commitment = hash(choice, votingPower, proposalId, voteSalt)
nullifier = hash(sk, proposalId)
```

### Test 4: Reveal Phase

| Step | Action | Expected |
|------|--------|----------|
| 1 | Commit phase 종료 대기 | "Reveal Phase" 표시 |
| 2 | "Reveal Vote" 클릭 | MetaMask 팝업 |
| 3 | 트랜잭션 승인 | 투표 집계됨 |
| 4 | 결과 확인 | For/Against/Abstain 수치 |

### Test 5: Double-Vote Prevention

| Step | Action | Expected |
|------|--------|----------|
| 1 | 이미 투표한 제안 선택 | 투표 버튼 비활성화 |
| 2 | nullifier 재사용 시도 | 트랜잭션 실패 |
| 3 | 에러 메시지 | "NullifierAlreadyUsed" |

### Test 6: Smart Contract Tests

```bash
# Hardhat 테스트 실행
npx hardhat test

# 특정 테스트만 실행
npx hardhat test test/PrivateVoting.test.ts
```

**테스트 케이스:**

| Test | Description |
|------|-------------|
| Proposal Creation | 제안 생성 및 merkle root 검증 |
| Vote Commitment | ZK proof 검증 및 commitment 저장 |
| Vote Reveal | commitment 검증 및 투표 집계 |
| Nullifier Check | 중복 투표 방지 |
| Phase Validation | Commit/Reveal 단계 검증 |

### Test 7: Circuit Compilation (Optional)

```bash
cd circuits

# 회로 컴파일
circom PrivateVoting.circom --r1cs --wasm --sym -o build/

# 제약 조건 수 확인
snarkjs r1cs info build/PrivateVoting.r1cs

# Expected: ~150,000 constraints
```

## D1 Spec Compliance Tests

### Public Inputs (4개)

```typescript
const publicInputs = [
  voteCommitment,  // hash(choice, votingPower, proposalId, voteSalt)
  proposalId,
  votingPower,
  merkleRoot
]
```

### Note Hash (5 params)

```typescript
// D1 스펙: hash(pkX, pkY, noteValue, tokenType, noteSalt)
const noteHash = poseidon([pkX, pkY, noteValue, tokenType, noteSalt])
```

### Commitment (4 params)

```typescript
// D1 스펙: hash(choice, votingPower, proposalId, voteSalt)
const commitment = poseidon([choice, votingPower, proposalId, voteSalt])
```

### Nullifier

```typescript
// D1 스펙: hash(sk, proposalId)
const nullifier = poseidon([sk, proposalId])
```

## Manual Testing Checklist

### UI Tests

- [ ] 랜딩 페이지 로드
- [ ] 지갑 연결
- [ ] 언어 전환 (KO/EN)
- [ ] 제안 목록 표시
- [ ] 제안 상세 페이지

### ZK Tests

- [ ] 키페어 자동 생성
- [ ] 토큰 노트 생성
- [ ] 머클 트리 구축
- [ ] 증명 생성 진행률
- [ ] commitment/nullifier 계산

### Blockchain Tests

- [ ] commitVote 트랜잭션
- [ ] revealVote 트랜잭션
- [ ] Etherscan에서 확인
- [ ] 투표 결과 집계

## Troubleshooting

### 페이지 로드 실패

```bash
rm -rf node_modules
npm install
npm run dev
```

### 지갑 연결 실패

1. MetaMask 설치 확인
2. Sepolia 네트워크 추가:
   - Network: Sepolia
   - RPC: https://sepolia.drpc.org
   - Chain ID: 11155111

### 트랜잭션 실패

| Error | Solution |
|-------|----------|
| NullifierAlreadyUsed | 이미 투표함 |
| NotInCommitPhase | Commit 단계 아님 |
| NotInRevealPhase | Reveal 단계 아님 |
| InvalidProof | ZK 증명 무효 |
| InvalidMerkleRoot | Merkle root 미등록 |

### ZK 증명 실패

1. LocalStorage 데이터 확인
2. 콘솔 에러 로그 확인
3. `clearAllData()` 호출 후 재시도

```javascript
// Browser console
import { clearAllData } from './zkproof'
clearAllData()
```

## Performance Benchmarks

| Operation | Expected Time |
|-----------|---------------|
| Key Generation | < 100ms |
| Merkle Tree (1M leaves) | < 5s |
| Proof Generation (simulated) | ~3s |
| Proof Generation (real) | 20-30s |

## Contract Addresses

| Network | Address |
|---------|---------|
| Sepolia | `0x583e8926F8701a196F182c449dF7BAc4782EF784` |

## Related Documentation

- [Architecture](./ARCHITECTURE.md)
- [Tech Stack](./TECH_STACK.md)
- [D1 Specification](https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md)
