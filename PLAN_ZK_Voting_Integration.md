# Implementation Plan: ZK-Voting Integration (Strict UX Fixes)

**Status**: COMPLETE - All 10 Commandments Verified
**Target**: Perfect UI Logic & Transaction Safety
**Last Updated**: 2026-02-11

---

## 🛡️ The 10 Commandments: Verification Gate
**STOP**: Do NOT proceed until these are verified.

| No. | Requirement | Verification Method (Test Scenario) | Pass |
|:---:|:---|:---|:---:|
| **1** | **Strict Symbol Usage** | Check `<img>` tags. MUST use `/assets/symbol.svg`. **NO** emojis/text. | [x] |
| **2** | **Locked Button Tooltip** | Hover over disabled "Create Proposal" button. MUST show tooltip: **"Need 100+ TON"**. | [x] |
| **3** | **Explicit Choice First** | UI Order: **1. Select For/Against** (Visual Highlight) -> **2. Slider** -> **3. Vote Button**. | [x] |
| **4** | **No Double-Action** | After slider, there should be **ONE "Confirm" button**. NOT "For/Against" buttons again. | [x] |
| **5** | **Post-Vote Privacy** | After voting, show: **"Vote Encrypted 🔒"**. Hide the slider. | [x] |
| **6** | **Loading Feedback** | During transaction: **Dim Background + Show Spinner**. Block all interaction. | [x] |
| **7** | **Token Deduction** | Verify `balanceOf` decreases by $N^2$ **ONLY AFTER** the transaction succeeds. | [x] |
| **8** | **NO Ghost Votes** | Create Proposal -> Check List. **Vote Count MUST be 0.** (Fix Contract Logic!) | [x] |
| **9** | **Transaction Safety** | Ensure Gas Limit is sufficient. Transaction must succeed in one go. | [x] |
| **10** | **Registration = Creation** | No separate "Register" step. `createProposal` is the only entry point. | [x] |

---

## 📱 UX/UI Detailed Specifications (The "CEO Approved" Flow)

### 1. Global Assets
- **Symbol**: Always render `public/assets/symbol.svg` with size `w-5 h-5` (or appropriate).
- **Style**: Dark Pop (Neon Accents) + Horizontal Scroll Layout.

### 2. Proposal Creation (Gatekeeper)
- **Condition**: User Balance < 100 TON.
- **UI State**:
  - Button: **Disabled / Opacity 50% / Lock Icon**.
  - **Interaction**: On Hover, display Tooltip **"Insufficient Balance. You need 100 TON to propose."**
- **Logic**: Creating a proposal does **NOT** cast a vote. Initial votes = 0.

### 3. The Voting Card (Strict Component Order)
**Do not invent UI. Follow this exact hierarchy inside the modal/card:**

**[Section A: Direction]**
- **Toggle/Segmented Control**: [ 👍 FOR ] | [ 👎 AGAINST ]
- **Behavior**: User MUST select one first. The selected option gets **Neon Border/Glow**.
- *Constraint*: Cannot move slider until direction is picked.

**[Section B: Intensity (Power)]**
- **Slider**: Range 1 to N.
- **Visual**: As slider moves, show cost calculation.
- **Display**: "Cost: **[symbol.svg]** $N^2$ TON"

**[Section C: Action]**
- **Single Button**: Label "Cast Vote" (or "Confirm").
- *Note*: Do NOT put "For/Against" logic here. Just "Execute".

### 4. Transaction Flow (The Feedback Loop)
- **Step 1: Click "Cast Vote"**
  - **Action**: Open Confirmation Modal (Red Warning: "One Shot Only").
- **Step 2: Confirm**
  - **UI Change**: **Immediately Dim the Screen (Overlay)**.
  - **Loader**: Show "Processing Transaction..." spinner centrally.
  - *Prevent any clicks on background.*
- **Step 3: Success**
  - **UI**: Hide Loader -> Show "Success" Toast/Confetti.
  - **Card Update**: Replace Slider/Buttons with message:
    > "✅ You have voted. Your choice is encrypted until the reveal phase."

---

## 🏗️ Logic & Contract Fixes

### 1. Fix "Ghost Vote" Bug (Critical)
- **File**: `contracts/ZkVoting.sol`
- **Action**: Look at `createProposal` function.
- **Fix**: Remove ANY call to `_castVote` or `voteCount++` inside this function.
- **Verify**: New proposals must start with `voteCount = 0`.

### 2. Transaction Reliability
- **Frontend**: When calling `writeContract`, explicitly set a slightly higher `gasLimit` buffer (e.g., +10%) to prevent "Out of Gas" failures.
- **Error Handling**: If User Rejects or Tx Fails -> **Remove Dimmer & Show Error Toast**.

---