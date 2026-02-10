# Implementation Plan: ZK-Voting Integration (Unified & Verified)

**Status**: 🔧 TON Integration Fix Complete
**Started**: 2026-02-10
**Last Updated**: 2026-02-10
**Target**: Production-Ready Logic & UI

---

## ✅ Critical Fix: SeigToken approveAndCall (2026-02-10)

**Problem**: SeigToken의 `transferFrom`은 "only sender or recipient can transfer" 제한이 있어서 일반 ERC20 approve 패턴이 작동하지 않음.

**Solution**: TON의 `approveAndCall` 패턴 사용
- Contract에 `onApprove` callback 추가
- Frontend에서 `approveAndCall` 한번 호출로 approve + vote 동시 처리
- 사용자는 **1번만 서명** (기존 2번 → 1번)

**Deployed Contract**: `0xF10ECe876D72317D8e3410D147A49380dd27264e`

**Commit**: `d6dcc5d Fix SeigToken transferFrom issue with approveAndCall pattern`

---

## 🛡️ The 9 Commandments: Verification Gate
**STOP**: Before writing any new code, verify these 9 requirements are met.
**Status**: ✅ All Verified (2026-02-10)

| No. | Requirement (The 9 Rules) | Verification Method (Test Scenario) | Pass |
|:---:|:---|:---|:---:|
| **1** | **Gatekeeping** (<100 TON Block) | Connect wallet with **10 TON**. "Create Proposal" button MUST be **Disabled/Greyed out**. | [x] |
| **2** | **Decoupling** (No Auto-Vote) | Create a proposal. Check list immediately. Vote count MUST be **0**. | [x] |
| **3** | **Countdown Timer** | Check Proposal Card. MUST show **"Time Remaining: DD:HH:MM"**. | [x] |
| **4** | **Conditional Deduction** | Move slider -> Check Wallet. Token MUST NOT be deducted until **after** modal confirm & signature. | [x] |
| **5** | **Custom Asset** (Strict) | Check UI icons. MUST use **`symbol.svg`** in `public/assets/`. **DO NOT** use emojis (💎) or generic coins. | [x] |
| **6** | **Ineligible UI** | Connect with low balance. Must see **Blocking Screen / Tooltip** explaining "Requires 100+ TON". | [x] |
| **7** | **One-Shot Warning** | Open Confirm Modal. Must see text: **"Final Decision / Cannot Change"** in Red. | [x] |
| **8** | **Pre-Flight Modal** | Click "Vote". **Custom Modal** must appear **BEFORE** MetaMask pops up. | [x] |
| **9** | **Registration = Creation** | Verify there is **NO separate "Register Candidate" button**. `createProposal` handles everything. | [x] |

---

## 📋 Overview

### Feature Description
A unified Zero-Knowledge voting system where users interact with a single slider (Linear UX). The system automatically handles logic branching ($Cost=1$ vs $Cost=N^2$). Includes strict "Token Gating" for proposal creation and "One-Shot" privacy voting.

### Success Criteria
- [ ] **Verification**: All 9 Commandments above must pass.
- [ ] **Visiblity**: Created proposals appear immediately (Fix "Ghost Data").
- [ ] **Privacy**: Votes are encrypted via ZK-SNARKs.

---

## 🏗️ Architecture Decisions

### 1. Decoupled Lifecycle (Strict Separation)
- **Role Definition**:
  - **Creator (Candidate)**: Must hold >100 TON. Creates a proposal. Does NOT automatically vote.
  - **Voter**: Anyone with TON. Votes on existing proposals.
- **Sequence**:
  1. User creates proposal -> Transaction confirms -> Proposal appears in list (0 Votes).
  2. User (including Creator) selects proposal -> Adjusts Slider -> Confirms Warning -> Votes.

### 2. Token Gating & Costs
- **Creation**: Requires **>100 TON** balance. (Free gas-only or small fee).
- **Voting**: Cost = $N^2$ TON. Deducted **only after** explicit confirmation.
- **One-Shot Rule**: One vote per wallet per proposal. No updates/top-ups allowed.
- **✅ TON Transfer**: Uses `approveAndCall` pattern (SeigToken 호환). Single signature.

---

## 📱 UX/UI Detailed Flow & Writing Specs

**Global Design Asset**:
- **Token Icon**: MUST use the provided **`symbol.svg`** file for ALL token displays.
- **Path**: `public/assets/symbol.svg` (Ensure file exists).
- **Constraint**: Do NOT use generic coin icons or text-only "TON".

### 1. Proposal Creation (The Gatekeeper)
*Reflects Rules 1, 6, 9*

- **State A: Ineligible User (<100 TON)**
  - **UI**: "Create Proposal" button is **Disabled (Greyed out/Locked)**.
  - **Feedback**: Show Tooltip/Text: "Insufficient Balance. Requires 100+ TON to propose."
  - **Action**: Click is blocked.

- **State B: Eligible User (>100 TON)**
  - **UI**: "Create Proposal" button is **Active (Primary Color)**.
  - **Action**: Opens "New Proposal" Form.
  - **UX Writing**:
    - *Header*: "Register Candidate / Create Proposal"
    - *Body*: "This action creates a new voting card. You are NOT voting yet."

- **State C: Creation Success**
  - **Feedback**: Toast Message "Proposal Created Successfully! Now, cast your vote."
  - **Result**: Redirect to list. Vote count shows **0**.

### 2. Proposal List & Countdown
*Reflects Rule 3*

- **Card Header**:
  - Display **"Time Remaining: DD:HH:MM"** until reveal/end.
  - If expired: Show "Voting Closed".

### 3. Voting Process (The Decision)
*Reflects Rules 2, 4, 7, 8*

- **Step 1: Adjust Slider**
  - **UI**: Slider moves from 1 to N.
  - **Dynamic Cost Display**: "Cost: **XX [symbol.svg]** (TON)" updates in real-time ($N^2$).
  - **Warning Text**: Display "⚠️ Single Vote Opportunity" near the slider.

- **Step 2: Pre-Flight Check (CRITICAL - Modal)**
  - **Trigger**: User clicks "Vote" button.
  - **UI**: **Full-screen Modal or Center Popup**.
  - **Content (UX Writing)**:
    - **Title**: "Confirm Your Vote"
    - **Big Value**: "You are casting **N Votes**"
    - **Cost Warning**: "This will deduct **XX [symbol.svg] TON** from your wallet."
    - **Finality Warning (Red)**: "You can only vote ONCE per proposal. This action cannot be undone or changed later."
  - **Buttons**: [Cancel] [Confirm & Sign]

- **Step 3: Transaction & Feedback** ✅ IMPLEMENTED
  - **Action**: User clicks [Confirm & Sign].
  - **State**: Loading Spinner "Generating ZK Proof..." -> Wallet Signature (**1번만!**)
  - **Method**: TON `approveAndCall` → Contract `onApprove` callback
  - **Success**: Confetti + "Vote Confirmed! (XX TON Deducted)".

---

## 🚀 Implementation Phases

### Phase 1: Emergency Fix & Logic Decoupling
**Goal**: Fix "Ghost Data" bug and decouple creation from voting.
- [ ] **Task 1.1**: Remove `_castVote` call inside `createProposal` (Contract).
- [ ] **Task 1.2**: Add `require(balanceOf(msg.sender) >= 100)` to `createProposal`.
- [ ] **Task 1.3**: Fix Frontend to fetch proposals immediately (BigInt/Index fix).
- [ ] **Verification**: Pass Rules #2 and #9.

### Phase 2: ZK Logic & Cost Model
**Goal**: Implement D1/D2 circuit logic.
- [ ] **Task 2.1**: Update Circuit to accept `cost` public input.
- [ ] **Task 2.2**: Verify `cost == vote * vote` inside circuit.
- [ ] **Verification**: Pass Rule #4.

### Phase 3: UX/UI Polish (The 9 Commandments)
**Goal**: Implement the strict UI states and Assets.
- [ ] **Task 3.1**: Check `public/assets/` and use **`symbol.svg`** for all icons. (Rule #5).
- [ ] **Task 3.2**: Implement "Pre-Flight Modal" with Red Warning. (Rule #7, #8).
- [ ] **Task 3.3**: Implement `disabled` state for <100 TON users. (Rule #1, #6).
- [ ] **Task 3.4**: Add Countdown Timer component. (Rule #3).

---

## 🧪 Final Checklist
- [ ] Did I use **`symbol.svg`** everywhere?
- [ ] Can a user vote twice? (Should be NO)
- [ ] Does creating a proposal cost vote tokens? (Should be NO, only gas/fee)