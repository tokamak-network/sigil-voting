# Landing/Technology Page Fact Check (Code-Based)

This report is **code-only** verification (no web/chain/NPM checks). It lists:
1) Missing information that should be added (implemented but not reflected)
2) Statements that do not match implementation
3) Statements that are incorrect or exaggerated (lack of evidence in repo)
4) Suggested text replacements (fact-based)

---

## 1) Missing Information (Implemented but not reflected)

- **Delegation (Vote Delegation)**
  - Implemented: `contracts/governance/DelegationRegistry.sol`, `contracts/voiceCreditProxy/DelegatingVoiceCreditProxy.sol`, UI in `src/components/governance/DelegationPage.tsx`.
  - Not mentioned on landing/technology pages.

- **On-chain Execution + Timelock**
  - Implemented: `contracts/governance/TimelockExecutor.sol`, UI in `src/components/governance/ExecutionPanel.tsx`, `ExecutionRegistrationForm.tsx`, `ExecutionTimeline.tsx`.
  - Not mentioned on landing/technology pages.

- **Delegation Registry Configuration**
  - Implemented: `src/config.json` and MACI registry support in `contracts/MACI.sol`.
  - Not reflected in landing/technology content.

---

## 2) Statements That Do Not Match Implementation

- **“Snapshot Merkle tree eligibility proof”**
  - Pages imply snapshot Merkle inclusion in the ZK proof.
  - **Mismatch**: No Snapshot integration or snapshot Merkle proof code exists. Eligibility is based on on-chain registration (`signUp`) and voice credit proxy.

- **“Vite static SPA”**
  - Pages describe Vite-based SPA deployment.
  - **Mismatch**: The app is Next.js App Router (`app/`, `next.config.ts`).

---

## 3) Incorrect / Overstated / Unverifiable (Repo Evidence Missing)

- **“SDK v0.1.0 — Available on NPM”**
  - SDK version in repo is `0.2.0` (`sdk/package.json`).
  - NPM publication is **not verifiable from repo**.

- **“440 automated tests passed”**
  - No test result artifacts or CI reports in repo.
  - `test-results/` is empty.

- **“All contracts deployed and verified on Sepolia”**
  - Addresses are in `src/config.json`, but **verification status is not provable from code**.

- **Performance figures** (proof time, gas per batch, L2 100x/6x, constraint counts)
  - No benchmark logs or measurement files in repo to justify these numbers.

---

## 4) Suggested Text Changes (Fact-Based)

Below are **direct replacement suggestions** aligned with implementation.

### A) ZK Voting Description (remove snapshot claims)

**Replace in** `src/i18n/en.ts`:
- `technology.zkVoting.desc`
- `technology.zkVoting.howDesc`

**Suggested text**:
```
Votes are sealed with Poseidon commitments and verified by Groth16 proofs. Each vote is encrypted client‑side, stored on‑chain as ciphertext, and tallied with ZK proofs — without any reveal phase. Individual votes remain permanently private.

When you vote, a Poseidon commitment locks your choice: H(choice, votingPower, proposalId, salt). Eligibility and voting power are enforced via on‑chain registration and the voice credit proxy, and the tally is verified with Groth16 proofs — without exposing your vote.
```

### B) Infrastructure Section (Vite -> Next.js)

**Replace in** `src/i18n/en.ts`:
- `technology.infrastructure.serverless.desc`

**Suggested text**:
```
The voting frontend is a static Next.js app that can be deployed on Vercel, Netlify, or GitHub Pages. All cryptographic operations (key generation, encryption, signing) happen in the user’s browser. Smart contracts handle registration and storage on‑chain. No backend server, no database, no API to maintain.
```

### C) SDK Availability (NPM claim)

**Replace in** `src/i18n/en.ts`:
- `landing.integration.comingSoon`

**Suggested text**:
```
SDK v0.x — Packaging in progress
```

### D) Tests Count

**Replace in** `src/i18n/en.ts`:
- `landing.stats.testsCount`
- `landing.stats.testsLabel`

**Suggested text**:
```
testsCount: 'Tests'
testsLabel: 'Automated coverage'
```

### E) Deployment Verification

**Replace in** `src/i18n/en.ts`:
- `landing.contracts.subtitle`

**Suggested text**:
```
Contracts are deployed on Ethereum Sepolia. Verification links are provided per contract.
```

### F) Performance Claims (tone down)

**Replace in** `src/i18n/en.ts`:
- `technology.specs.*`
- `technology.pipeline.*`
- `landing.faq.a2`
- `landing.advantages.l2.desc`

**Suggested pattern**:
```
Proof generation varies by circuit size, hardware, and network conditions.
On-chain verification costs depend on network conditions and batch size.
L2s significantly reduce cost and latency compared to L1, depending on chain conditions.
```

---

## Summary

- Core MACI architecture, ZK verification, in-circuit DuplexSponge, quadratic voting, key-change anti-collusion, and GitHub Actions coordinator are **implemented**.
- Landing/technology pages **over-claim or mismatch** on snapshot eligibility, Vite SPA, test counts, NPM availability, deployment verification, and performance numbers.
- Delegation and on-chain execution features are **implemented but not reflected**.
