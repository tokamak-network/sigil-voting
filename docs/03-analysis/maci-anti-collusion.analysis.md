# Analysis: MACI Anti-Collusion Infrastructure

> **Feature**: maci-anti-collusion
> **Phase**: Check (Gap Analysis)
> **Created**: 2026-02-15
> **Status**: ANALYZED
> **Match Rate**: 76%
> **Design Reference**: `docs/02-design/features/maci-anti-collusion.design.md`

---

## 1. Overall Scores

| Category | Items | Matching | Rate | Status |
|----------|:-----:|:--------:|:----:|:------:|
| Smart Contracts (Section 4) | 13 | 11 full + 2 via npm | 92% | PASS |
| ZK Circuits (Section 5) | 6 | 6 | 100% | PASS |
| Coordinator Service (Section 6) | 8 | 7.5 | 92% | PASS |
| Crypto Modules (Section 7) | 4 | 4 | 100% | PASS |
| Frontend V2 (Section 9) | 5 | 5 | 100% | PASS |
| Contract Tests (Section 12.1) | 13 | 13 | 100% | PASS |
| Circuit Tests (Section 12.2) | 8 | 0 | 0% | FAIL |
| MACI Property Tests (Section 12.3) | 7 | 0 | 0% | FAIL |
| Implementation Steps (Section 11) | 8 | 7.5 | 94% | PASS |
| **Weighted Overall** | **72** | **55** | **76%** | **FAIL** |

---

## 2. Smart Contracts (92%)

### 2.1 IMPLEMENTED (11/13)

| Contract | Lines | Deployed (Sepolia) |
|----------|:-----:|:------------------:|
| MACI.sol | 106 | 0x68E0D7AA5859BEB5D0aaBBf5F1735C8950d0AFA3 |
| Poll.sol | 123 | (via MACI.deployPoll) |
| MessageProcessor.sol | 78 | (via MACI.deployPoll) |
| Tally.sol | 104 | (via MACI.deployPoll) |
| AccQueue.sol | 301 | 0xC87be30dDC7553b12dc2046D7dADc455eb4fc7e2 |
| VkRegistry.sol | 66 | 0x8aD6bBcE212d449253AdA2dFC492eD2C7E8A341F |
| DomainObjs.sol | 21 | (inherited) |
| ISignUpGatekeeper.sol | - | (interface) |
| FreeForAllGatekeeper.sol | - | 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672 |
| IVoiceCreditProxy.sol | - | (interface) |
| ConstantVoiceCreditProxy.sol | - | 0x800D89970c9644619566FEcdA79Ff27110af0cDf |

### 2.2 NOT IN PROJECT (2/13 - via npm)

| Contract | Design Expectation | Actual |
|----------|-------------------|--------|
| PoseidonT3.sol | Project-level file | Uses `poseidon-solidity/PoseidonT3.sol` (npm) |
| PoseidonT6.sol | Project-level file | Uses `poseidon-solidity/PoseidonT6.sol` (npm) |

Impact: LOW - npm dependency is acceptable and already deployed on Sepolia via CREATE2.

### 2.3 Deviations

| Item | Design | Implementation | Impact |
|------|--------|----------------|:------:|
| MACI constructor | `new AccQueue()` inline | Pre-deployed AccQueue address param | LOW (intentional gas fix) |
| State leaf hash | PoseidonT6 (5-input + padding) | PoseidonT5 (4-input) | LOW (more correct) |
| Tally.publishResults | `uint256[][] _tallyProof` (Merkle proof) | `uint256 _tallyResultsHash` (hash comparison) | MEDIUM (simplified) |
| VkRegistry key scheme | Direct uint256 mapping | keccak256(depth pair) + onlyOwner | LOW (improved) |
| MessageProcessor | `processedMessageCount` | `processedBatchCount` + `completeProcessing()` | LOW (improved) |

---

## 3. ZK Circuits (100%)

### 3.1 IMPLEMENTED (6/6)

| Circuit | Lines | Status |
|---------|:-----:|:------:|
| MessageProcessor.circom | 363 | EXISTS |
| TallyVotes.circom | 171 | EXISTS |
| utils/quinaryMerkleProof.circom | 68 | EXISTS |
| utils/duplexSponge.circom | 103 | EXISTS |
| utils/sha256Hasher.circom | 60 | EXISTS |
| utils/unpackCommand.circom | 70 | EXISTS |

### 3.2 Deviations

| Item | Design | Implementation | Impact |
|------|--------|----------------|:------:|
| In-circuit DuplexSponge decrypt | Full decryption in circuit | Prover provides decrypted inputs | MEDIUM (trust assumption) |
| Compilation parameters | Production (depth=10, batch=5) | Test-only (depth=2, batch=2) | LOW (expected for dev) |

---

## 4. Coordinator Service (92%)

> **Correction (2026-02-15)**: Initial gap analysis incorrectly reported 0% (8 files missing).
> All 8 files exist under `coordinator/src/` (993 total lines). Re-evaluated below.

### 4.1 IMPLEMENTED (8/8 files)

| Design File | Lines | Content Match | Score |
|-------------|:-----:|:-------------:|:-----:|
| index.ts | 28 | Barrel export, all modules re-exported | 100% |
| processing/processMessages.ts | 217 | Reverse processing, ECDH, DuplexSponge, EdDSA verify, Key Change, invalid→index0 | 95% |
| processing/tally.ts | 97 | D1/D2 support, tallyCommitment = poseidon_3 | 90% |
| processing/batchProof.ts | 167 | snarkjs Groth16, SHA256 publicInputHash, process+tally proof | 85% |
| chain/listener.ts | 97 | ethers.js EventListener, SignUp+MessagePublished, fetchPastEvents | 90% |
| chain/submitter.ts | 129 | mergeAccQueues, submitProcessProof, submitTallyProof, publishResults | 95% |
| trees/quinaryTree.ts | 137 | 5-ary Poseidon, insert/update/getProof, zeroValues | 95% |
| trees/accQueue.ts | 121 | enqueue/merge, subtree computation | 90% |

**Average Score: ~92%**

### 4.2 Architectural Notes

- Design's `crypto/` subdirectory (5 files) not duplicated; uses shared `src/crypto/` modules via DI pattern (architecturally superior)
- `trees/stateTree.ts`, `ballotTree.ts`, `messageTree.ts` consolidated into `processMessages.ts` (reasonable simplification)
- TallyProofInput: some private inputs omitted (commented "for brevity")

---

## 5. Crypto Modules (100%)

### 5.1 IMPLEMENTED (4/4 + barrel export)

| Module | Lines | Key Functions |
|--------|:-----:|---------------|
| ecdh.ts | 114 | generateECDHSharedKey (with Poseidon hash) |
| duplexSponge.ts | 196 | encrypt/decrypt (proper sponge construction) |
| eddsa.ts | 131 | eddsaSign/eddsaVerify (Poseidon-based) |
| blake512.ts | 78 | derivePrivateKey + helpers |
| index.ts | 35 | Barrel export |

### 5.2 Minor Deviations

- ecdh.ts applies additional Poseidon hash on shared key (MACI convention, design simplified)
- duplexSponge.ts uses 3-element state with domain separator (more correct than design's 4-element)
- blake512.ts adds `generateRandomPrivateKey()` and `derivePrivateKeyFromSignature()` helpers

---

## 6. Frontend V2 (100%)

### 6.1 IMPLEMENTED (5/5 + extras)

| Component | Lines | Status |
|-----------|:-----:|:------:|
| VoteFormV2.tsx | 201 | EXISTS |
| MergingStatus.tsx | 67 | EXISTS |
| ProcessingStatus.tsx | 74 | EXISTS |
| KeyManager.tsx | 189 | EXISTS |
| MACIVotingDemo.tsx | 370 | ADDED (not in design, integrates all) |
| contractV2.ts | - | ADDED (V2 ABIs and addresses) |

### 6.2 Deviations

| Item | Impact |
|------|:------:|
| VoteFormV2 uses placeholder EdDSA signature (0n, 0n, 0n) | MEDIUM |
| RevealForm.tsx not removed (kept for V1 compatibility) | LOW |

---

## 7. Test Coverage

### 7.1 Contract Tests: 13/13 (100%)

All 13 design-specified tests pass in `test/MACI.t.sol`.
Additional: `test/AccQueue.t.sol` with 16 extra test functions.
Total: 62 tests passed, 0 failed.

### 7.2 Circuit Tests: 0/8 (0%)

No circuit test files exist. Circuits are written but untested.

### 7.3 MACI Property Tests: 0/7 (0%)

None of the 7 MACI security property tests (Collusion Resistance, Receipt-freeness, Privacy, Uncensorability, Unforgeability, Non-repudiation, Correct Execution) have been implemented.

### 7.4 Crypto Module Tests: 1 file exists

`test/crypto/crypto.test.ts` exists but coverage scope unknown.

---

## 8. Implementation Steps Status

| Step | Description | Status | Rate |
|:----:|-------------|:------:|:----:|
| 1 | Crypto Infrastructure | COMPLETE | 100% |
| 2 | AccQueue + Quinary Tree Contracts | COMPLETE | 100% |
| 3 | MACI Separated Contracts | COMPLETE | 100% |
| 4 | MessageProcessor Circuit | COMPLETE | 100% |
| 5 | TallyVotes Circuit | COMPLETE | 100% |
| 6 | Coordinator Service | COMPLETE | 92% |
| 7 | Frontend V2 | COMPLETE | 100% |
| 8 | Key Change Extension | PARTIAL | 50% |

---

## 9. D1/D2 Integration Status

### 9.1 Reveal Removal

| Contract | Has revealVote? | Expected |
|----------|:--------------:|:--------:|
| MACI.sol (V2) | NO | Correct |
| Poll.sol (V2) | NO | Correct |
| MessageProcessor.sol (V2) | NO | Correct |
| Tally.sol (V2) | NO | Correct |
| ZkVotingFinal.sol (V1) | YES | Expected (V1 deprecated) |
| PrivateVoting.sol (V1) | YES | Expected (V1 deprecated) |

V2 contracts correctly have zero reveal functions.

### 9.2 Integration Level

MACI V2 is **completely standalone** from D1/D2 V1:
- Separate contract addresses
- Separate frontend routes (`maci-voting` vs `proposals`)
- No cross-references in code
- Design intended V1/V2 to coexist (Section 1.4)

---

## 10. Recommended Actions (Priority Order)

### P0: Blocking (Required for end-to-end functionality)

1. **Implement real EdDSA signing in VoteFormV2** - Replace placeholder zeros
2. **Circuit compilation + trusted setup** - At least dev-level ptau for testing

### P1: Quality (Required for 90% match rate)

3. **Add Circuit Tests** (8 tests from design Section 12.2) — would raise match rate to ~88%
4. **Add MACI Property Tests** (7 tests from design Section 12.3) — would raise match rate to ~97%
5. **Full in-circuit DuplexSponge decryption** - Remove trust assumption on prover
6. **Tally.publishResults Merkle proof verification** - Replace hash comparison

### P2: Polish

7. Update design document to reflect constructor changes
8. Add crypto module unit tests
9. Production circuit parameters compilation

---

## 11. Added Features (Not in Design)

| Item | Description |
|------|-------------|
| MACIVotingDemo.tsx | Integrated demo page with all V2 phases |
| contractV2.ts | V2 contract configuration module |
| DeployMACI.s.sol | Forge deployment script |
| MockVerifier.sol | Standalone mock for testnet |
| AccQueue.t.sol | 16 additional AccQueue tests |
| MessageProcessor.completeProcessing() | Processing completion gate function |

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-15 | AI | Initial Gap Analysis (Check phase) |
| 2026-02-15 | AI | Corrected Coordinator 0%→92%, Impl Steps 69%→94%, Overall 58%→76% |
