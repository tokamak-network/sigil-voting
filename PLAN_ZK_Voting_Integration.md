# Implementation Plan: ZK-Voting Integration (D1+D2 Unified)

**Status**: 🚑 Emergency Fix & Integration
**Started**: 2026-02-10
**Last Updated**: 2026-02-10
**Estimated Completion**: 2026-02-13

---

**⚠️ CRITICAL INSTRUCTIONS**: After completing each phase:
1. ✅ Check off completed task checkboxes
2. 🧪 Run all quality gate validation commands (`npx hardhat test`, `npm run test`)
3. ⚠️ Verify ALL quality gate items pass
4. 📅 Update "Last Updated" date above
5. 📝 Document learnings in Notes section
6. ➡️ Only then proceed to next phase

⛔ **DO NOT skip quality gates or proceed with failing checks**

---

## 📋 Overview

### Feature Description
A unified Zero-Knowledge voting system where users interact with a single slider (Linear UX). The system automatically handles logic branching: 1 vote ($Cost=1$) vs. N votes ($Cost=N^2$). Includes strict "Token Gating" for proposals and "Privacy" for votes using ZK-SNARKs.

### Success Criteria
- [ ] **Linear UX**: User adjusts slider -> Clicks "Vote" -> System handles the rest.
- [ ] **Logic Branching**: System correctly differentiates $N=1$ vs $N>1$ internal logic.
- [ ] **Visibility**: Created proposals must appear immediately in the UI (Fixing "Ghost Data").
- [ ] **Privacy**: Votes are encrypted via ZK Proofs on-chain.

---

## 🏗️ Architecture Decisions

### 📐 Logic Flow Blueprint (Strict Sequence)
**Note**: The system must strictly follow this "Linear UX, Branching Logic" sequence based on the finalized flowchart.

1.  **User Action**: Adjust Slider (Select $N$) -> **Click 'Vote' Button** (Trigger).
2.  **System Check**: Receive $N$.
    - If $N=1$: Apply Logic A (Cost = 1).
    - If $N>1$: Apply Logic B (Cost = $N^2$).
3.  **On-Chain Execution**:
    - Step 1: **Generate ZK Proof** (Client-side Web Worker).
    - Step 2: **Submit Transaction** (User signs).
    - Step 3: **Deduct Tokens** (Smart Contract execution).
4.  **Completion**: Vote Recorded & UI Update.

**⚠️ CRITICAL**: Token deduction must ONLY happen AFTER the user clicks 'Vote' and signs the transaction. Do not deduct tokens on slider change.

### 📱 UX/UI Detailed Flow & States
**Objective**: Define exact UI states (Loading, Error, Success) for a seamless "One-Flow" experience.

1.  **Initial State (Idle)**:
    - Slider: Enabled. Cost Display: Updates dynamically ($N^2$).
    - Vote Button: Enabled.
2.  **Proof Generation State (Loading Phase 1)**:
    - **Trigger**: Click "Vote".
    - **UI**: Global Overlay "Generating Zero-Knowledge Proof...", Button Disabled (Spinner).
    - **Action**: Web Worker calculates proof.
3.  **Wallet Signature State (Loading Phase 2)**:
    - **Trigger**: Proof ready.
    - **UI**: Toast "Please confirm in wallet". Button: "Sign Transaction".
4.  **Transaction Submission State (Loading Phase 3)**:
    - **Trigger**: User signs.
    - **UI**: Button "Submitting Vote...", Status "Verifying on-chain...".
5.  **Completion State (Success)**:
    - **Trigger**: Tx Confirmed.
    - **UI**: Success Confetti 🎉, Toast "Vote Cast!", Redirect/Refresh.

---

## 📦 Dependencies

### Required Before Starting
- [ ] Hardhat environment (Sepolia/Local)
- [ ] Circom 2.x & SnarkJS
- [ ] React + Viem/Ethers (Frontend)

---

## 🧪 Test Strategy

### Testing Approach
**TDD Principle**: strictly follow **Red (Fail) -> Green (Pass) -> Blue (Refactor)**.

### Test Pyramid
| Test Type | Coverage | Purpose |
|-----------|----------|---------|
| **Unit Tests** | 100% | Contract Logic (Cost, Proposal Creation) |
| **Circuit Tests** | 100% | ZK Proof Validity (Secret inputs) |
| **E2E Tests** | Critical | Full Flow: Create Proposal -> Vote -> Reveal |

---

## 🚀 Implementation Phases

### Phase 1: Emergency Fix (Proposal Creation & Visibility)
**Goal**: Fix the `createProposal` revert issue and ensure proposals are visible in the UI.
**Status**: ✅ COMPLETED (2026-02-10)

#### Tasks

**🔴 RED: Write Diagnostic Tests**
- [x] **Test 1.1 (Contract Debug)**: Write `scripts/debug_proposals.ts` to:
  1. Mint tokens to a test account.
  2. Call `createProposal`.
  3. **Expect**: Transaction succeeds.
  4. Immediately read `proposals(lastIndex)`.
  5. **Expect**: Data matches input (Title, Description).
  - ✅ **PASSED**: 3 proposals readable, all data valid
- [x] **Test 1.2 (Frontend Integration)**: Check `useProposals` hook.
  - Verify it handles BigInt correctly.
  - Verify it triggers re-fetch after `ProposalCreated` event.
  - ✅ **PASSED**: Frontend fetch simulation successful

**🟢 GREEN: Fix the Code**
- [x] **Task 1.3 (Contract Hotfix)**:
  - If Revert: Temporarily disable complex Merkle Root checks in `createProposal`. Only check `ERC20.balanceOf > 100`.
  - ✅ **Root Cause Found**: Function selector was wrong (`a7c6f7a5` → `b4e0d6af`)
- [x] **Task 1.4 (Frontend Hotfix)**:
  - Fix array indexing (Off-by-one error?).
  - Ensure IPFS hashes (if used) are fetching correctly.
  - ✅ **Fixed**: Corrected `proposalsD2` selector in `QuadraticVotingDemo.tsx`

**🔵 REFACTOR: Verify**
- [x] **Verification**: Manual test on Localhost. Create Proposal -> Refresh -> Card appears.
  - ✅ **PASSED**: User confirmed proposals visible
  - ✅ **BONUS**: Added loading state to prevent "empty state" flash

#### Quality Gate ✋
- [x] **Blocker Removed**: Can I create a proposal and see it? ✅ YES

---

### Phase 2: The Brain (ZK Circuits & Logic)
**Goal**: Implement the `vote.circom` circuit that supports both D1 and D2 logic via a single proof.
**Status**: ✅ COMPLETED (2026-02-10)

#### Tasks

**🔴 RED: Write Failing Tests First**
- [x] **Test 2.1**: Circuit Logic Tests (`test/circuits/vote_test_real.cjs`)
  - Case A: Input 1 Vote -> Public Cost 1 -> ✅ **PASS**
  - Case B: Input 5 Votes -> Public Cost 25 -> ✅ **PASS**
  - Case C: Input 5 Votes -> Public Cost 10 -> ✅ **FAIL** (correctly rejected)
  - Case D: Nullifier Uniqueness -> ✅ **PASS**
  - **All 5 tests passing (4s)**

**🟢 GREEN: Implement to Make Tests Pass**
- [x] **Task 2.2**: Implement `circuits/D2_QuadraticVoting.circom`
  - ✅ Inputs: `creditRoot`, `proposalId`, `creditsSpent`, `voteCommitment` (Public)
  - ✅ Logic: Merkle Membership, Quadratic Cost (`cost == numVotes * numVotes`)
  - ✅ Already implemented and working
- [x] **Task 2.3**: Generate Verifier & Integrate
  - ✅ `circuits/build_d2/` contains compiled WASM and zkey
  - ✅ Verifier integrated in contract

**🔵 REFACTOR: Clean Up Code**
- [x] **Task 2.4**: Constraints optimized for browser (~1M constraints)

#### Quality Gate ✋
- [x] **TDD Compliance**: All circuit tests pass? ✅ 5/5 passing
- [x] **Security**: Vote choice is PRIVATE (not in public inputs) ✅

---

### Phase 3: The Body (Frontend "One-Flow")
**Goal**: Implement the Linear UX with State Machine defined in "Architecture Decisions".
**Status**: ✅ COMPLETED (2026-02-10)

#### Tasks

**🔴 RED: Write Failing Tests First**
- [x] **Test 3.1**: UX Logic Test (`test/frontend/voting-state.test.ts`)
  - ✅ State transitions: IDLE -> PROOFING -> SIGNING -> SUBMITTING -> SUCCESS
  - ✅ Quadratic cost calculation
  - ✅ UI messages per state
  - **All 12 tests passing**

**🟢 GREEN: Implement to Make Tests Pass**
- [x] **Task 3.2**: Implement `VotingCard` with State Machine
  - ✅ Created `src/hooks/useVotingMachine.ts` with reducer pattern
  - ✅ States: `IDLE`, `PROOFING`, `SIGNING`, `SUBMITTING`, `SUCCESS`, `ERROR`
  - ✅ UI: Progress bar and state-specific emoji indicators
  - ✅ Integrated into `QuadraticVotingDemo.tsx`
- [x] **Task 3.3**: Web Worker for SnarkJS
  - ✅ Created `src/workers/zkProofWorker.ts` - dedicated worker for proof generation
  - ✅ Created `src/workers/proofWorkerHelper.ts` - Promise-based API with fallback
  - ✅ Integrated into `generateQuadraticProof` in zkproof.ts
  - ✅ Progress updates from worker to main thread
  - ✅ Fallback to main thread if worker fails
- [x] **Task 3.4**: Connect to Contract
  - ✅ `writeContract` calls `castVoteD2` with proof args
  - ✅ Transaction confirmation wait before SUCCESS

**🔵 REFACTOR: Clean Up Code**
- [x] **Task 3.5**: Polish Error Messages (User-friendly)
  - ✅ Korean error messages for creditRoot mismatch
  - ✅ Detect old proposals with invalid creditRoot
  - ✅ Guide users to create new proposals

#### Quality Gate ✋
- [x] **UX Check**: Does the flow match the "Linear Flow" chart? ✅ YES
- [x] **Performance**: Proof generation optimized with Web Worker
- [x] **Feedback**: Do users see "Success" confetti? ✅ YES - CSS animation added

---

## ⚠️ Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| **Ghost Data (UI Sync)** | High | High | Use Graph Node or reliable RPC for event indexing. |
| **Proof Time > 10s** | Medium | Medium | Optimize Circuit or use remote prover (optional). |
| **Gas Cost Spikes** | High | Medium | Batch verifications (Future scope). |

---

## 📝 Notes & Learnings
- (Record any snarkjs specific version issues here)
- (Document gas usage per vote)