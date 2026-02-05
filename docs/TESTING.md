# Testing Guide

## Overview

D1 Private Voting 테스트 가이드입니다. 총 28개의 테스트가 모두 통과합니다.

## Test Summary

```
28 tests passed, 0 failed
├── PrivateVoting.t.sol: 24 passed (Contract Logic)
└── RealProof.t.sol:      4 passed (Real ZK Proof)
```

## Prerequisites

### Required

- Node.js 18+
- Foundry (forge)

### Optional (ZK Circuit)

- circom 2.1.6+
- snarkjs

## Quick Start

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Run all tests
cd zk-dex-d1-private-voting
forge test -vv
```

## Test Categories

### 1. Contract Logic Tests (24 tests)

**File**: `test/PrivateVoting.t.sol`

#### Merkle Root Tests (2)

| Test | Description |
|------|-------------|
| `test_RegisterMerkleRoot` | 머클 루트 등록 |
| `test_RegisterMultipleMerkleRoots` | 다중 머클 루트 등록 |

#### Proposal Tests (3)

| Test | Description |
|------|-------------|
| `test_CreateProposal` | 제안 생성 |
| `test_CreateProposal_WithDetails` | 제안 상세 정보 확인 |
| `test_RevertWhen_InvalidMerkleRoot` | 잘못된 머클 루트 거부 |

#### Commit Phase Tests (6)

| Test | Description |
|------|-------------|
| `test_CommitVote` | 투표 커밋 |
| `test_CommitVote_UpdatesTotalCommitments` | 커밋 수 업데이트 |
| `test_RevertWhen_NullifierAlreadyUsed` | Nullifier 중복 사용 방지 |
| `test_RevertWhen_ZeroVotingPower` | 0 투표권 거부 |
| `test_RevertWhen_InvalidProof` | 잘못된 증명 거부 |
| `test_RevertWhen_NotInCommitPhase` | 커밋 단계 아닐 때 거부 |

#### Reveal Phase Tests (9)

| Test | Description |
|------|-------------|
| `test_RevealVote_For` | FOR 투표 공개 |
| `test_RevealVote_Against` | AGAINST 투표 공개 |
| `test_RevealVote_Abstain` | ABSTAIN 투표 공개 |
| `test_RevealVote_UpdatesRevealedCount` | 공개 수 업데이트 |
| `test_RevertWhen_InvalidReveal` | 잘못된 공개 거부 |
| `test_RevertWhen_AlreadyRevealed` | 중복 공개 방지 |
| `test_RevertWhen_NotInRevealPhase_TooEarly` | 공개 단계 전 거부 |
| `test_RevertWhen_NotInRevealPhase_TooLate` | 공개 단계 후 거부 |
| `test_RevertWhen_InvalidChoice` | 잘못된 선택 거부 |

#### Phase Tests (3)

| Test | Description |
|------|-------------|
| `test_GetPhase_Commit` | 커밋 단계 확인 |
| `test_GetPhase_Reveal` | 공개 단계 확인 |
| `test_GetPhase_Ended` | 종료 단계 확인 |

#### Integration Test (1)

| Test | Description |
|------|-------------|
| `test_FullVotingFlow` | 전체 투표 플로우 (3명 투표, 집계) |

### 2. Real ZK Proof Tests (4 tests)

**File**: `test/RealProof.t.sol`

이 테스트들은 **실제 snarkjs로 생성된 Groth16 proof**를 사용합니다.

| Test | Description |
|------|-------------|
| `test_RealProofVerification` | 실제 ZK proof 검증 성공 |
| `test_RejectInvalidProof` | 변조된 proof 거부 |
| `test_RejectWrongPublicSignals` | 잘못된 public signals 거부 |
| `test_PublicSignalsMatchD1Spec` | D1 스펙 준수 확인 |

## ZK Proof Testing

### Circuit Compilation

```bash
cd circuits
npm install circomlib circomlibjs

# Compile circuit
circom PrivateVoting.circom --r1cs --wasm --sym -o build/ -l node_modules

# Output:
# non-linear constraints: 9732
# linear constraints: 6888
# public inputs: 4
# private inputs: 30
```

### Generate Proving Key

```bash
cd circuits/build

# Download Powers of Tau
curl -L -o pot15_final.ptau https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau

# Setup
snarkjs groth16 setup PrivateVoting.r1cs pot15_final.ptau PrivateVoting_0000.zkey

# Finalize with beacon
snarkjs zkey beacon PrivateVoting_0000.zkey PrivateVoting_final.zkey 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon"

# Export verification key
snarkjs zkey export verificationkey PrivateVoting_final.zkey verification_key.json

# Export Solidity verifier
snarkjs zkey export solidityverifier PrivateVoting_final.zkey Verifier.sol
```

### Generate Valid Test Inputs

```bash
# generate_input.js uses circomlibjs to compute:
# - Baby Jubjub key derivation: sk → (pkX, pkY)
# - Note hash: Poseidon(pkX, pkY, noteValue, tokenType, noteSalt)
# - Merkle root: 20-level tree with single leaf
# - Vote commitment: Poseidon(choice, votingPower, proposalId, voteSalt)

node generate_input.js > input.json
```

### Generate & Verify Proof

```bash
# Generate witness
node PrivateVoting_js/generate_witness.js PrivateVoting_js/PrivateVoting.wasm input.json witness.wtns

# Generate proof
snarkjs groth16 prove PrivateVoting_final.zkey witness.wtns proof.json public.json

# Verify off-chain
snarkjs groth16 verify verification_key.json public.json proof.json
# Output: [INFO] snarkJS: OK!

# Export calldata for on-chain verification
snarkjs zkey export soliditycalldata public.json proof.json
```

### On-chain Verification

`RealProof.t.sol`에서 실제 생성된 proof를 Solidity verifier로 검증합니다:

```solidity
// Real proof from snarkjs
uint256[2] pA = [0x03014ac..., 0x26bf8cf...];
uint256[2][2] pB = [[...], [...]];
uint256[2] pC = [0x2228b7f..., 0x122560c...];

// Public signals (4 as per D1 spec)
uint256[4] publicSignals = [
    voteCommitment,
    proposalId,      // = 1
    votingPower,     // = 100
    merkleRoot
];

// Verify
bool result = verifier.verifyProof(pA, pB, pC, publicSignals);
assertTrue(result); // PASS
```

## D1 Spec Compliance Tests

### Public Inputs (4개)

```
[0] voteCommitment = Poseidon(choice, votingPower, proposalId, voteSalt)
[1] proposalId = 1
[2] votingPower = 100
[3] merkleRoot = 12685498...
```

### Verified Computations

| Computation | Formula | Verified |
|-------------|---------|----------|
| Note Hash | `Poseidon(pkX, pkY, noteValue, tokenType, noteSalt)` | ✅ |
| Key Derivation | `BabyJub.mulPointEscalar(Base8, sk)` | ✅ |
| Merkle Root | `20-level Poseidon tree` | ✅ |
| Vote Commitment | `Poseidon(choice, votingPower, proposalId, voteSalt)` | ✅ |
| Nullifier | `Poseidon(sk, proposalId)` | ✅ |

## Running Specific Tests

```bash
# All tests
forge test -vv

# Contract logic only
forge test --match-path test/PrivateVoting.t.sol -vv

# Real ZK proof only
forge test --match-path test/RealProof.t.sol -vv

# Specific test
forge test --match-test test_FullVotingFlow -vv

# With gas report
forge test --gas-report
```

## Test Output Example

```
Ran 28 tests for 2 test suites

test/PrivateVoting.t.sol:PrivateVotingTest
[PASS] test_CommitVote() (gas: 540990)
[PASS] test_FullVotingFlow() (gas: 1135846)
... (24 tests)

test/RealProof.t.sol:RealProofTest
[PASS] test_RealProofVerification() (gas: 245725)
[PASS] test_RejectInvalidProof() (gas: 1040431731)
[PASS] test_RejectWrongPublicSignals() (gas: 247289)
[PASS] test_PublicSignalsMatchD1Spec() (gas: 6645)

Suite result: ok. 28 passed; 0 failed; 0 skipped
```

## Troubleshooting

### Witness Generation Fails

```
Error: Assert Failed. Error in template PrivateVoting_234 line: 108
```

**원인**: 입력값이 회로 제약조건을 만족하지 않음
**해결**: `generate_input.js`로 유효한 입력 생성

### Circuit Too Big for PTAU

```
Error: circuit too big for this power of tau ceremony. 16620*2 > 2**14
```

**해결**: 더 큰 ptau 파일 사용 (pot15 이상)

### Forge Not Found

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc  # or ~/.zshrc
foundryup
```

## Related Files

```
test/
├── PrivateVoting.t.sol    # Contract logic tests
└── RealProof.t.sol        # Real ZK proof tests

contracts/
├── PrivateVoting.sol      # Main contract
└── Groth16Verifier.sol    # Generated verifier

circuits/build/
├── proof.json             # Generated proof
├── public.json            # Public signals
└── verification_key.json  # Verification key
```
