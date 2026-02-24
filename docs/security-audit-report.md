# SIGIL Security Audit Report

**Date:** 2026-02-24
**Auditor:** Claude Opus 4.6 (Automated Code Review)
**Scope:** Smart Contracts, Coordinator, Frontend, SDK
**Commit:** `839adde` (main branch)

---

## Executive Summary

The SIGIL project implements MACI-based private voting on Sepolia with a Next.js frontend, coordinator auto-runner (GitHub Actions cron), and SDK for cryptographic operations. The codebase demonstrates strong security fundamentals: proper use of checks-effects-interactions pattern, SHA256 public input hashing with `& ((1<<253)-1)` (not modular reduction), and encrypted key storage in the browser.

**One High-severity issue was found and fixed**: the `TimelockExecutor.registerExecution()` function lacked access control and tally address validation, allowing an attacker to register a malicious execution target with a fake Tally contract for any poll. This has been patched.

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 0 | - |
| High | 2 | 2 |
| Medium | 4 | 0 |
| Low | 5 | 0 |
| Info | 7 | 0 |

---

## Findings

### HIGH-1: TimelockExecutor — Permissionless Registration with Arbitrary Tally Address [FIXED]

**File:** `contracts/governance/TimelockExecutor.sol:55-78`
**Status:** FIXED

**Description:** The `registerExecution()` function had no access control and accepted an arbitrary `tallyAddr` parameter without validating it corresponds to the actual Tally contract for the given `pollId`. An attacker could:

1. Deploy a fake Tally contract that returns `tallyVerified() = true`, `forVotes > againstVotes`, and sufficient `totalVoters`.
2. Call `registerExecution(pollId, fakeTallyAddr, maliciousTarget, maliciousCalldata, ...)` before the legitimate poll creator.
3. Since `AlreadyRegistered` prevents re-registration, the legitimate creator is permanently locked out.
4. After the timelock expires, `execute()` would call the attacker's chosen `target` with their `callData`.

**Impact:** An attacker could execute arbitrary on-chain actions (e.g., drain funds, transfer ownership) through a legitimate-looking governance process.

**Fix Applied:**
- Added access control: only MACI owner can register executions
- Added tally address validation: `tallyAddr.poll()` must match `MACI.polls(pollId)`
- Added zero-address checks for `tallyAddr` and `target`

### HIGH-2: TimelockExecutor — No Validation That tallyAddr Is Authentic [FIXED]

**File:** `contracts/governance/TimelockExecutor.sol:55-78`
**Status:** FIXED (same fix as HIGH-1)

**Description:** Even without the front-running issue, the `schedule()` function trusted whatever `tallyAddr` was stored during registration. A malicious registrant could provide a contract that implements the Tally interface but returns fabricated results (`tallyVerified=true`, inflated `forVotes`). The `schedule` and `canSchedule` functions would accept these fake results.

**Impact:** Bypass of governance vote results, enabling execution of arbitrary proposals regardless of actual vote outcomes.

---

### MEDIUM-1: FreeForAllGatekeeper Allows Unlimited Sybil Registrations

**File:** `contracts/gatekeepers/FreeForAllGatekeeper.sol`

**Description:** The `FreeForAllGatekeeper` allows any address to register without restriction. A single entity can create many addresses and register all of them, inflating `numSignUps` and filling the state tree. While MACI's message-processing circuit handles invalid messages gracefully, the cost of processing increases linearly with the number of registrations.

**Impact:** DoS on coordinator (increased processing time and gas costs), potential filling of state tree (limited by `5^stateTreeDepth`).

**Recommendation:** For production deployments, use a token-gated or proof-of-humanity gatekeeper. The `FreeForAllGatekeeper` is acceptable for testnet/dev use.

### MEDIUM-2: Unbounded Delegation Loop in _getEffectiveBalance / DelegatingVoiceCreditProxy

**File:** `contracts/MACI.sol:187-198`, `contracts/voiceCreditProxy/DelegatingVoiceCreditProxy.sol:40-43`

**Description:** Both `_getEffectiveBalance()` and `DelegatingVoiceCreditProxy.getVoiceCredits()` iterate over the entire delegators array. While each address can only delegate once, an attacker creating many addresses and delegating all to a single target could make these functions gas-expensive. If called during `signUp()` (via `voiceCreditProxy.getVoiceCredits`), this could cause the signup transaction to exceed the block gas limit.

**Impact:** Potential DoS on `signUp()` for delegates with many delegators.

**Recommendation:** Add a maximum delegator limit (e.g., 100) in `DelegationRegistry.delegate()`, or use a gas-bounded iteration pattern.

### MEDIUM-3: Poll.publishMessage Has No Spam Protection

**File:** `contracts/Poll.sol:71-83`

**Description:** `publishMessage()` has no access control beyond the voting period check. Any address can submit encrypted messages (not just registered voters). While invalid messages are rejected by the circuit during off-chain processing, each message still increases:
- On-chain gas for AccQueue operations
- Coordinator processing time (decryption attempts)
- Circuit proof generation time

**Impact:** Economic DoS on the coordinator. An attacker can cheaply spam many messages, significantly increasing processing costs.

**Recommendation:** Consider requiring a minimum gas price or adding a per-sender message limit. Alternatively, the coordinator could prioritize messages from registered voters during off-chain processing.

### MEDIUM-4: Key Encryption Derives AES Key From Wallet Address Alone

**File:** `src/crypto/keyStore.ts:20-36`

**Description:** The `deriveKey()` function uses PBKDF2 with the user's wallet address as the sole key material. While it uses 100,000 iterations and a fixed salt, the wallet address is public information. Any party who knows a user's address can derive the same AES key and decrypt their stored EdDSA private key from localStorage.

The encryption provides protection against casual inspection in browser DevTools but not against a targeted attack. The comment "Not a substitute for proper key management in production" acknowledges this.

**Impact:** An attacker with access to the victim's localStorage data (via XSS on the same origin, physical access, or browser extension) AND knowledge of their wallet address can decrypt their MACI voting key.

**Recommendation:** Incorporate a user-provided password or derive the key from a wallet signature (which requires user interaction). The current approach is acceptable for the testnet phase but should be strengthened before mainnet deployment.

---

### LOW-1: MACI.signUp Lacks Duplicate Registration Prevention

**File:** `contracts/MACI.sol:103-127`

**Description:** The `signUp()` function allows the same address to register multiple times with the same or different EdDSA public keys. Each registration creates a new state leaf and increments `numSignUps`. While this is consistent with MACI's design (the circuit handles duplicate registrations by processing messages in reverse order and only applying the latest valid one), it wastes state tree slots.

**Impact:** State tree can be filled faster than expected. With depth=2 (dev), only 24 voter slots exist. A griefer registering multiple times wastes slots.

**Recommendation:** Consider tracking registered addresses in a mapping and reverting on duplicate registration, or at minimum document this as expected behavior.

### LOW-2: AccQueue.enqueue Does Not Check merged Flag Consistently

**File:** `contracts/AccQueue.sol:141-163`

**Description:** `enqueue()` checks `if (merged) revert AlreadyMerged()` but `resetMerge()` resets both `merged` and `subRootsMerged`. After a reset, new enqueues are allowed, but the existing `subRoots` array retains old entries. New subtrees are appended, and the next `merge()` will include both old and new subtrees. This is the intended behavior (MACI state persists across polls), but it could be confusing and may lead to unexpectedly large trees over time.

**Impact:** Low. The state tree grows monotonically across polls, which is by design but could eventually hit gas limits for merge operations.

### LOW-3: CSP Allows unsafe-eval and unsafe-inline

**File:** `next.config.ts:9`

**Description:** The Content Security Policy includes `'unsafe-eval'` and `'unsafe-inline'` in `script-src`. While these are commonly required for Next.js applications, they weaken XSS protections.

**Impact:** If an XSS vector were found, the CSP would not prevent execution of injected scripts.

**Recommendation:** Investigate Next.js nonce-based CSP to remove `unsafe-inline`. The `unsafe-eval` may be required by circomlibjs/WASM modules and is harder to eliminate.

### LOW-4: Coordinator Secret Key Passed to Circuit Input (Expected but Sensitive)

**File:** `coordinator/src/processing/batchProof.ts:71`

**Description:** The coordinator's Baby Jubjub secret key is passed as a circuit input for proof generation. This is by design (the circuit needs it for ECDH decryption), but the key exists in memory during proof generation. The coordinator properly sanitizes error messages to avoid logging secrets.

**Impact:** If the coordinator process is compromised during proof generation, the secret key could be extracted from memory.

**Recommendation:** This is inherent to MACI's design. The coordinator should run in a trusted execution environment for production deployments.

### LOW-5: VkRegistry Owner Is Immutable With No Transfer Function

**File:** `contracts/VkRegistry.sol:8,22-24`

**Description:** The `VkRegistry` uses `immutable` for the owner, making it impossible to transfer ownership. If the deployer's key is lost or compromised, a new VkRegistry must be deployed and all dependent contracts redeployed.

**Impact:** Reduced operational flexibility. Not a security vulnerability per se, but a resilience concern.

**Recommendation:** Consider adding an `onlyOwner` `transferOwnership()` function, consistent with the pattern used in MACI.sol.

---

### INFO-1: Solidity Compiler Version Range in Groth16 Verifiers

**File:** `contracts/Groth16VerifierMsgProcessor.sol:21`, `contracts/MessageProcessorVerifier.sol:21`

**Description:** The snarkjs-generated verifier contracts use `pragma solidity >=0.7.0 <0.9.0`, while the rest of the project uses `^0.8.24`. This is standard for snarkjs-generated code and not a vulnerability, but the wide range means these contracts could be compiled with an older compiler that has known issues.

**Recommendation:** Pin to `^0.8.24` for consistency (would require modifying auto-generated files).

### INFO-2: React JSX Escaping Prevents Proposal Title XSS

**File:** `src/components/ProposalsList.tsx:540`

**Description:** Proposal titles (which come from on-chain `Poll.title()`) are rendered via React JSX interpolation (`{poll.title}`), which automatically escapes HTML entities. No `dangerouslySetInnerHTML` is used anywhere in the codebase. This is a positive finding.

### INFO-3: No dangerouslySetInnerHTML Usage Anywhere

**File:** All `src/` components

**Description:** The entire frontend codebase avoids `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, and `document.write`. All user-generated content is safely rendered through React's built-in escaping.

### INFO-4: Security Headers Are Comprehensive

**File:** `next.config.ts:4-41`

**Description:** The application sets proper security headers including HSTS, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, and frame-ancestors 'none'. This is a positive finding.

### INFO-5: SHA256 Bit Masking Correctly Uses Bitwise AND

**File:** `contracts/MessageProcessor.sol:79`, `contracts/Tally.sol:81`, `coordinator/src/processing/batchProof.ts:187`

**Description:** All SHA256 public input hash computations correctly use `& ((1 << 253) - 1)` (bitwise AND) instead of `% SNARK_SCALAR_FIELD` (modular reduction). This is consistent with the circuit's `Bits2Num(253)` and complies with the project's CLAUDE.md rules.

### INFO-6: Coordinator Properly Sanitizes Error Messages

**File:** `coordinator/src/run.ts`, `coordinator/src/cron.ts`

**Description:** Both coordinator entry points sanitize error messages before logging, replacing Ethereum addresses with `[REDACTED]` or `[ADDR]` and truncating messages. Private keys are never logged. This is a positive finding.

### INFO-7: Foundry Library Linking Only in [profile.deploy]

**File:** `foundry.toml:7-16`

**Description:** Library linking is correctly placed only in `[profile.deploy]`, not in `[profile.default]`. This complies with the project's CLAUDE.md rules.

---

## Gas Optimization Analysis

### GAS-1: AccQueue._resetCurrentSubtree Uses Loop for Deletion

**File:** `contracts/AccQueue.sol:218-228`

**Description:** `_resetCurrentSubtree()` loops through all `LEAVES_PER_SUBTREE` positions to delete mapping entries. For `subDepth=2`, this iterates 25 times. Each `delete` is an SSTORE from non-zero to zero (refunds 4800 gas since EIP-3529) but still costs gas for the SLOAD + SSTORE operations.

**Savings Estimate:** Not directly optimizable without redesigning the data structure. The loop is bounded and predictable.

### GAS-2: _buildTreeFromRoots Allocates New Arrays at Each Level

**File:** `contracts/AccQueue.sol:295-354`

**Description:** `_buildTreeFromRoots()` allocates new `uint256[]` arrays at each tree level during merge. Since this is a `view`-like internal function called from `merge()`, the memory allocation cost is relatively low compared to the SSTORE operations in the parent function.

**Savings Estimate:** Minimal. Could be optimized by pre-allocating a single buffer, but the function is called rarely (once per merge).

### GAS-3: _getEffectiveBalance Makes Multiple External Calls

**File:** `contracts/MACI.sol:187-205`

**Description:** `_getEffectiveBalance()` makes one `staticcall` per delegator to read token balances. For users with many delegators, this could be gas-intensive. This is also identified as MEDIUM-2 above.

**Savings Estimate:** Depends on number of delegators. Each `staticcall` costs ~2600 gas (cold) or ~100 gas (warm).

### GAS-4: VkRegistry Uses Dynamic Arrays for VK Storage

**File:** `contracts/VkRegistry.sol:10-11`

**Description:** Verification keys are stored as `uint256[]` dynamic arrays, which require a length SLOAD plus per-element SLOADs. Since VKs are typically read once per proof verification and the VkRegistry is not directly called during voting operations, this is acceptable.

**Savings Estimate:** Negligible impact on user-facing operations.

### GAS-5: Struct Packing Opportunity in TimelockExecutor.Execution

**File:** `contracts/governance/TimelockExecutor.sol:15-24`

**Description:** The `Execution` struct has `ExecutionState state` (uint8) as the last field. It could be packed with `address creator` (20 bytes) to share a storage slot, saving one SSTORE/SLOAD per read/write.

**Current layout (6 slots):**
- Slot 1: `creator` (20 bytes) + 12 bytes padding
- Slot 2: `tallyAddr` (20 bytes) + 12 bytes padding
- Slot 3: `target` (20 bytes) + 12 bytes padding
- Slot 4: `callData` (dynamic, pointer)
- Slot 5: `timelockDelay` (32 bytes)
- Slot 6: `quorum` (32 bytes)
- Slot 7: `scheduledAt` (32 bytes)
- Slot 8: `state` (1 byte) + 31 bytes padding

**Optimized layout:**
- Move `state` next to an address field to pack into the same slot.

**Savings Estimate:** ~2100 gas per registration, ~200 gas per state read. Minor since governance operations are infrequent.

**Note:** No gas optimizations were applied as code changes, because the savings are minimal and the risk of introducing behavioral changes outweighs the benefit. The contracts are not called in high-frequency loops.

---

## Cryptographic Implementation Review (SDK)

### ECDH (sdk/src/crypto/ecdh.ts)
- Uses Baby Jubjub scalar multiplication via `circomlibjs` -- correct.
- Ephemeral key generation uses `crypto.getRandomValues()` with 32 bytes -- adequate entropy.
- Key reduction via `% BABYJUB_SUBORDER` -- correct for Baby Jubjub private keys.
- Retry loop (100 attempts) for non-zero key generation -- sufficient.

### EdDSA (sdk/src/crypto/eddsa.ts)
- Uses `eddsa.signPoseidon()` from circomlibjs -- correct MACI-compatible implementation.
- Secret key converted to 32-byte big-endian buffer -- correct for circomlibjs.
- No timing side-channels in the TypeScript layer (circomlibjs handles constant-time operations internally).

### DuplexSponge (sdk/src/crypto/duplexSponge.ts)
- Poseidon permutation via `poseidon(inputs, initState, t)` -- correct 3-arg circomlibjs form.
- Initial state: `[0, key[0], key[1], nonce + length * 2^128]` -- matches MACI spec.
- Authentication tag verification on decryption -- correctly throws on mismatch.
- Padding with zeros for non-multiple-of-3 plaintext -- correct.
- Field arithmetic uses `% SNARK_FIELD_SIZE` for the DuplexSponge state (this is correct, distinct from SHA256 bit masking).

### Key Derivation (sdk/src/crypto/blake512.ts)
- Uses BLAKE2b-512 with 64-byte output, taking first 32 bytes -- matches RFC 8032 pattern.
- Bit clamping (`keyBytes[0] &= 0xf8`, `keyBytes[31] &= 0x7f`, `keyBytes[31] |= 0x40`) -- correct for EdDSA.
- Final reduction `% BABYJUB_SUBORDER` -- correct.

**Verdict:** All cryptographic implementations are correct and consistent with MACI specifications.

---

## Summary of Actions Taken

1. **FIXED** `TimelockExecutor.registerExecution()`:
   - Added MACI owner access control
   - Added tally address validation (checks `tallyAddr.poll() == MACI.polls(pollId)`)
   - Added zero-address checks
   - Ran `forge fmt` on the modified file
   - All 293 tests pass after the fix

2. **No gas optimizations applied** -- all identified savings are minimal and not worth the risk of behavioral changes.

3. **No other code changes** -- Medium/Low findings are documented for future consideration but do not require immediate fixes.

---

## Disclaimer

This audit was performed through automated code review. It does not replace a professional security audit by a specialized firm. The following areas were NOT covered:
- Circom circuit correctness (only coordinator/SDK-side integration was reviewed)
- Formal verification of contract invariants
- Economic attack modeling
- Infrastructure security (GitHub Actions, Vercel, RPC providers)
- Social engineering vectors
