# Analysis: MACI Anti-Collusion Infrastructure

> **Feature**: maci-anti-collusion
> **Phase**: Check (Gap Analysis) — Re-analysis
> **Created**: 2026-02-15
> **Updated**: 2026-02-15
> **Status**: PASS
> **Match Rate**: 97%
> **Previous Match Rate**: 76%
> **Design Reference**: `docs/02-design/features/maci-anti-collusion.design.md`

---

## 1. Overall Scores

| Category | Items | Matching | Rate | Status | Change |
|----------|:-----:|:--------:|:----:|:------:|:------:|
| Smart Contracts (Section 4) | 13 | 12.5 | 96% | PASS | +4% |
| ZK Circuits (Section 5) | 6 | 6 | 100% | PASS | 0% |
| Coordinator Service (Section 6) | 8 | 7.5 | 94% | PASS | +2% |
| Crypto Modules (Section 7) | 4 | 4 | 100% | PASS | 0% |
| Frontend V2 (Section 9) | 5 | 5 | 100% | PASS | 0% |
| Contract Tests (Section 12.1) | 13 | 13 | 100% | PASS | 0% |
| Circuit Tests (Section 12.2) | 8 | 8 | 100% | PASS | **+100%** |
| MACI Property Tests (Section 12.3) | 7 | 7 | 100% | PASS | **+100%** |
| Implementation Steps (Section 11) | 8 | 8 | 100% | PASS | +6% |
| **Weighted Overall** | **72** | **70.5** | **97%** | **PASS** | **+21%** |

---

## 2. Smart Contracts (96%)

### 2.1 IMPLEMENTED (13/13)

| Contract | Lines | Deployed (Sepolia) |
|----------|:-----:|:------------------:|
| MACI.sol | 116 | 0x68E0D7AA5859BEB5D0aaBBf5F1735C8950d0AFA3 |
| Poll.sol | 123 | (via MACI.deployPoll) |
| MessageProcessor.sol | 88 | (via MACI.deployPoll) |
| Tally.sol | 117 | (via MACI.deployPoll) |
| AccQueue.sol | 301 | 0xC87be30dDC7553b12dc2046D7dADc455eb4fc7e2 |
| VkRegistry.sol | 66 | 0x8aD6bBcE212d449253AdA2dFC492eD2C7E8A341F |
| DomainObjs.sol | 21 | (inherited) |
| ISignUpGatekeeper.sol | - | (interface) |
| FreeForAllGatekeeper.sol | - | 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672 |
| IVoiceCreditProxy.sol | - | (interface) |
| ConstantVoiceCreditProxy.sol | - | 0x800D89970c9644619566FEcdA79Ff27110af0cDf |
| PoseidonT3.sol | - | via npm `poseidon-solidity` (CREATE2) |
| PoseidonT6.sol | - | via npm `poseidon-solidity` (CREATE2) |

### 2.2 NEW: Real Groth16 Verifiers (Phase 10)

| Contract | Status |
|----------|:------:|
| Groth16VerifierMsgProcessor.sol | NEW - Implements IVerifier |
| Groth16VerifierTally.sol | NEW - Implements IVerifier |
| IVerifier.sol | NEW - Shared interface |
| MockVerifier.sol | Testnet only |

### 2.3 Security Hardening (Phase 5)

- **MACI.sol**: `onlyOwner` on `deployPoll()`
- **MessageProcessor.sol**: `onlyCoordinator` on `processMessages()` + `completeProcessing()`
- **Tally.sol**: `onlyCoordinator` on `tallyVotes()` + `publishResults()`

### 2.4 Remaining Deviations

| Item | Design | Implementation | Impact |
|------|--------|----------------|:------:|
| MACI constructor | `new AccQueue()` inline | Pre-deployed AccQueue address param | LOW |
| State leaf hash | PoseidonT6 (5-input + padding) | PoseidonT5 (4-input) | LOW |
| Tally.publishResults | `uint256[][] _tallyProof` (Merkle proof) | Poseidon commitment check | LOW |

---

## 3. ZK Circuits (100%)

### 3.1 IMPLEMENTED (6/6)

| Circuit | Lines | Status |
|---------|:-----:|:------:|
| MessageProcessor.circom | 383 | EXISTS |
| TallyVotes.circom | 171 | EXISTS |
| utils/quinaryMerkleProof.circom | 68 | EXISTS |
| utils/duplexSponge.circom | 169 | EXISTS |
| utils/sha256Hasher.circom | 60 | EXISTS |
| utils/unpackCommand.circom | 70 | EXISTS |

### 3.2 RESOLVED: In-Circuit DuplexSponge (Phase 6)

MessageProcessor.circom now performs full in-circuit decryption via `PoseidonDuplexSpongeDecrypt(7)` with auth tag verification. Trust assumption eliminated.

---

## 4. Coordinator Service (94%)

### 4.1 IMPLEMENTED (8/8 files)

| Design File | Lines | Score |
|-------------|:-----:|:-----:|
| index.ts | 28 | 100% |
| processing/processMessages.ts | 217 | 95% |
| processing/tally.ts | 97 | 95% |
| processing/batchProof.ts | 167 | 85% |
| chain/listener.ts | 97 | 90% |
| chain/submitter.ts | 129 | 95% |
| trees/quinaryTree.ts | 137 | 95% |
| trees/accQueue.ts | 121 | 90% |

D1/D2 mode integration complete in tally.ts.

---

## 5. Crypto Modules (100%)

| Module | Lines | Key Functions |
|--------|:-----:|---------------|
| ecdh.ts | 114 | generateECDHSharedKey |
| duplexSponge.ts | 196 | poseidonEncrypt/poseidonDecrypt |
| eddsa.ts | 131 | eddsaSign/eddsaVerify |
| blake512.ts | 78 | derivePrivateKey |
| index.ts | 35 | Barrel export |

---

## 6. Frontend V2 (100%)

### 6.1 IMPLEMENTED (5/5 + extras)

| Component | Lines | Status |
|-----------|:-----:|:------:|
| VoteFormV2.tsx | 276 | EXISTS |
| MergingStatus.tsx | 67 | EXISTS |
| ProcessingStatus.tsx | 74 | EXISTS |
| KeyManager.tsx | 217 | EXISTS |
| MACIVotingDemo.tsx | 370 | ADDED |

### 6.2 RESOLVED: Real EdDSA Signing (Phase 3)

VoteFormV2.tsx and KeyManager.tsx now use real `eddsaSign()` with Poseidon-based hashing. Placeholder (0n, 0n, 0n) eliminated.

### 6.3 D1/D2 Mode Integration (Phase 9)

VoteFormV2 supports D1 (3 choices) and D2 (2 choices binary) mode selection.

---

## 7. Test Coverage

### 7.1 Contract Tests: 13/13 (100%)

All 13 design-specified tests in `test/MACI.t.sol`.
Additional: `test/AccQueue.t.sol` (16 tests), `test/RealVerifier.t.sol` (7 tests).
Total Forge tests: 69 passed, 0 failed.

### 7.2 Circuit Tests: 8/8 (100%) — RESOLVED

| # | Design Test | File | Status |
|:-:|-------------|------|:------:|
| 1 | DuplexSponge encrypt/decrypt | `test/circuits/duplexSponge_compat.test.ts` (4 tests) | PASS |
| 2 | EdDSA signature verification | `test/circuits/maci_circuit.test.ts` | PASS |
| 3 | Reverse processing / Command unpack | `test/circuits/maci_circuit.test.ts` | PASS |
| 4 | Invalid message rejection | `test/circuits/maci_circuit.test.ts` | PASS |
| 5 | Key Change reflection | `test/circuits/maci_circuit.test.ts` | PASS |
| 6 | Quinary Merkle proof | `test/circuits/maci_circuit.test.ts` | PASS |
| 7 | SHA256 public input | `test/circuits/maci_circuit.test.ts` | PASS |
| 8 | Tally commitment | `test/circuits/maci_circuit.test.ts` (2 tests) | PASS |

Total: 12 circuit tests (exceeds 8 required).

### 7.3 MACI Property Tests: 7/7 (100%) — RESOLVED

| # | Property | Tests | Status |
|:-:|----------|:-----:|:------:|
| 1 | Collusion Resistance | 2 | PASS |
| 2 | Receipt-freeness | 2 | PASS |
| 3 | Privacy | 4 | PASS |
| 4 | Uncensorability | 3 | PASS |
| 5 | Unforgeability | 3 | PASS |
| 6 | Non-repudiation | 2 | PASS |
| 7 | Correct Execution | 4 | PASS |

Total: 20 property tests in `test/maci_property.test.ts` (exceeds 7 required).

### 7.4 Crypto Module Tests

`test/crypto/crypto.test.ts`: 22 tests covering ECDH, DuplexSponge, EdDSA, BLAKE512.

### 7.5 Total Test Count

| Category | Count |
|----------|:-----:|
| Forge (contract) tests | 69 |
| Circuit tests (vitest) | 12 |
| Property tests (vitest) | 20 |
| Crypto tests (vitest) | 22 |
| **Total** | **123** |

---

## 8. Implementation Steps (100%)

| Step | Description | Status | Rate |
|:----:|-------------|:------:|:----:|
| 1 | Crypto Infrastructure | COMPLETE | 100% |
| 2 | AccQueue + Quinary Tree Contracts | COMPLETE | 100% |
| 3 | MACI Separated Contracts | COMPLETE | 100% |
| 4 | MessageProcessor Circuit | COMPLETE | 100% |
| 5 | TallyVotes Circuit | COMPLETE | 100% |
| 6 | Coordinator Service | COMPLETE | 95% |
| 7 | Frontend V2 | COMPLETE | 100% |
| 8 | Key Change Extension | COMPLETE | 100% |

---

## 9. Previous Gap Resolution

| # | Gap (76% analysis) | Resolution | Status |
|:-:|-------------------|------------|:------:|
| 1 | Circuit Tests 0/8 | 12 tests added | RESOLVED |
| 2 | Property Tests 0/7 | 20 tests added | RESOLVED |
| 3 | VoteFormV2 placeholder EdDSA (0n,0n,0n) | Real eddsaSign() | RESOLVED |
| 4 | In-circuit DuplexSponge trust assumption | Full in-circuit decrypt | RESOLVED |
| 5 | Tally.publishResults hash comparison | Poseidon commitment verification | RESOLVED |
| 6 | MockVerifier instead of real Groth16 | Two real Groth16 verifiers added | RESOLVED |

---

## 10. Added Features (Not in Design)

| Item | Description |
|------|-------------|
| Groth16VerifierMsgProcessor.sol | Real snarkjs-generated verifier |
| Groth16VerifierTally.sol | Real snarkjs-generated verifier |
| IVerifier.sol | Shared verifier interface |
| MockVerifier.sol | Testnet mock |
| MACIVotingDemo.tsx | Integrated demo with D1/D2 mode |
| contractV2.ts | V2 ABI/address configuration |
| DeployMACI.s.sol | Forge deployment script |
| AccQueue.t.sol | 16 additional tests |
| RealVerifier.t.sol | 7 verifier compliance tests |
| duplexSponge_compat.test.ts | 4 TS-circom compatibility tests |
| onlyCoordinator/onlyOwner | Access control modifiers |
| completeProcessing() | Processing gate function |

---

## 11. Remaining (Non-blocking)

| Item | Description | Priority |
|------|-------------|:--------:|
| Design doc update | Reflect actual publishResults signature | P2 |
| Production circuit params | stateTreeDepth=10, batchSize=5 | P3 |
| Trusted setup ceremony | Multi-party ceremony for production | P3 |
| Coordinator config/main | CLI entry point for production use | P3 |

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-15 | AI | Initial Gap Analysis: 76% |
| 2026-02-15 | AI | Corrected Coordinator 0%->92%, Overall 58%->76% |
| 2026-02-15 | AI | Re-analysis after Phase 1-10: 76%->97% PASS |
