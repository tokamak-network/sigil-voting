# MACI Anti-Collusion Infrastructure - Official Specification

> **Source**: PSE MACI Protocol (https://github.com/privacy-scaling-explorations/maci)
> **Design Doc**: `docs/02-design/features/maci-anti-collusion.design.md`
> **Fetched**: 2026-02-13
> **Status**: AUTHORITATIVE - All implementation MUST conform to this spec

---

## Overview

MACI (Minimum Anti-Collusion Infrastructure) prevents vote buying and coercion by encrypting votes with the Coordinator's public key and processing them in reverse order. Key Change mechanism makes bribery economically irrational — a voter can always override a coerced vote without the briber knowing.

**MACI is NOT a separate voting mode.** It is the **infrastructure layer** that wraps D1 (Private Voting) and D2 (Quadratic Voting), providing anti-collusion guarantees on top of both.

**Constraints**: ~500K–1M (MessageProcessor), ~200K (TallyVotes) | **Complexity**: High

---

## UX 원칙: 하나의 서비스 (CRITICAL)

**D1, D2, MACI는 사용자에게 보이지 않는다.**

SIGIL은 D1(비밀투표) + D2(이차투표) + MACI(담합방지)를 합쳐서 **하나의 투표 시스템**으로 제공한다. 사용자는 "비밀 투표"와 "이차 투표"를 선택하지 않는다. 모든 투표가 동시에:

- **비공개** (D1 — 투표 내용 암호화)
- **공정** (D2 — 이차 비용으로 고래 방지)
- **매수 불가** (MACI — 키 변경으로 강요 방어)

사용자가 보는 것:
- 찬성 / 반대 선택
- 투표 강도 조절 (비용 = 강도²)
- 끝.

사용자가 알 필요 없는 것:
- D1, D2, MACI라는 용어
- 비밀 투표 / 이차 투표라는 구분
- 암호화 방식, 키 변경 원리 등 기술 디테일

**UI에서 "비밀 투표", "이차 투표" 모드 선택기를 절대 만들지 마라.**

---

## Background

MACI addresses governance attacks that D1/D2 alone cannot prevent:

- **Vote Buying**: A briber pays voters to vote a specific way; with public votes, compliance is verifiable. MACI makes compliance **unverifiable** through encryption + key change
- **Coercion**: A powerful entity forces voters to vote a specific way; MACI allows voters to secretly override coerced votes
- **Collusion Rings**: Groups coordinate votes for mutual benefit; MACI prevents coordination by hiding individual votes from everyone except the Coordinator
- **Receipt Generation**: Voters cannot produce a valid receipt proving how they voted, because key change invalidates any "proof" they show

> "Even if a voter shows their secret key to a briber, the briber cannot know if the voter changed their key afterward. The last key change wins."

---

## 7 Security Properties (ALL MUST be satisfied)

| # | Property | Description | Mechanism |
|:-:|----------|-------------|-----------|
| 1 | **Collusion Resistance** | Only Coordinator can verify votes, not briber | DuplexSponge encryption with Coordinator's key |
| 2 | **Receipt-freeness** | Voter cannot prove how they voted | Key Change + reverse processing → old votes invalidated |
| 3 | **Privacy** | Individual vote choice NEVER appears on-chain in plaintext | No reveal phase; only aggregate results published |
| 4 | **Uncensorability** | Coordinator cannot omit votes | Immutable on-chain AccQueue; omission causes proof failure |
| 5 | **Unforgeability** | Cannot submit votes on behalf of others | EdDSA signature required with voter's current key |
| 6 | **Non-repudiation** | Cannot delete a submitted vote | New votes override (replace), never delete |
| 7 | **Correct Execution** | Tally is provably correct | zk-SNARK on-chain verification (Groth16) |

---

## System Architecture

### Phase Flow

```
Registration → Voting → AccQueue Merge → Processing → Tallying → Finalized
```

| Phase | Value | Condition | Allowed Actions |
|-------|:-----:|-----------|-----------------|
| **Voting** | 0 | `now <= endTime` | signUp, publishMessage |
| **Merging** | 1 | AccQueue merge in progress | mergeMaci*() |
| **Processing** | 2 | `endTime < now && !tallyVerified` | processMessages (Coordinator only) |
| **Finalized** | 3 | `tallyVerified == true` | getResults (read only) |

### Contract Architecture (Separated Pattern)

```
MACI.sol ──── Registration (signUp + deployPoll)
  │
  ├── Poll.sol ──── Voting (publishMessage + AccQueue merge)
  │
  ├── MessageProcessor.sol ──── State transition verification
  │
  └── Tally.sol ──── Tally verification + result publishing
```

Supporting contracts:
- `AccQueue.sol` — Quinary (5-ary) accumulator queue
- `VkRegistry.sol` — Verification key registry
- `SignUpGatekeeper` — Registration eligibility check
- `VoiceCreditProxy` — Voice credit allocation

---

## Technical Specification

### Registration (signUp)

**Auto-triggered** when a user creates a proposal or votes for the first time. No separate "register" action required in UI.

| Input | Type | Description |
|-------|------|-------------|
| `pubKeyX` | field | EdDSA public key X (Baby Jubjub) |
| `pubKeyY` | field | EdDSA public key Y |
| `signUpGatekeeperData` | bytes | Gatekeeper verification data |
| `initialVoiceCreditProxyData` | bytes | Voice credit query data |

**State Leaf** (4-input Poseidon):
```
stateLeaf = Poseidon4(pubKeyX, pubKeyY, voiceCreditBalance, timestamp)
```

State Tree: Quinary (arity=5), depth=10 → supports ~9.7M users
- Leaf 0: Blank State Leaf (reserved for invalid message routing)
- Leaf 1+: Registered users (1-indexed)

### Voting (publishMessage)

| Input | Type | Description |
|-------|------|-------------|
| `encMessage[10]` | field[] | DuplexSponge encrypted message (10 fields) |
| `encPubKeyX` | field | Ephemeral public key X (ECDH) |
| `encPubKeyY` | field | Ephemeral public key Y |

**Command Structure** (binary-packed before encryption):
```
command = {
  stateIndex:      50 bits   // User's position in State Tree
  newPubKeyX:     253 bits   // For key change (or same key)
  newPubKeyY:     253 bits
  voteOptionIndex: 50 bits   // proposalId
  newVoteWeight:   50 bits   // D1: votingPower, D2: numVotes
  nonce:           50 bits   // Must be ballot.nonce + 1
  pollId:          50 bits   // Poll identifier
  salt:           253 bits   // Randomness
}
```

**Command Hash**:
```
commandHash = Poseidon4(packedValues, newPubKeyX, newPubKeyY, salt)
```

**Encryption Flow**:
1. `signature = EdDSA.sign(commandHash, voterSk)`
2. `sharedKey = ECDH(ephemeralSk, coordinatorPubKey)`
3. `plaintext = [packedCommand..., signature.R8[0], signature.R8[1], signature.S]`
4. `encMessage = PoseidonDuplexSponge.encrypt(plaintext, sharedKey, nonce=0)`

### Key Change (Anti-Coercion Core)

The **defining feature** of MACI. A voter can change their EdDSA key at any time during voting by setting `newPubKey` to a different key in their command.

```
Scenario: Alice coerced by Bob

T1: Alice registers with pk1
T2: Alice votes FOR (coerced by Bob) — signed with pk1
T3: Alice changes key pk1 → pk2 — signed with pk1
T4: Alice votes AGAINST (true preference) — signed with pk2

Coordinator processes in REVERSE order (T4 → T3 → T2 → T1):
  T4: pk2 signature valid → AGAINST recorded
  T3: pk1 signature valid → key change applied (pk1 → pk2)
  T2: pk1 signature... but key already changed to pk2 → INVALID → routed to index 0

Result: Alice's final vote = AGAINST
Bob cannot verify because:
  - On-chain messages are encrypted
  - Even with pk1, Bob can't decrypt T3/T4 (different ephemeral keys)
  - Bribery fails
```

### Processing (Coordinator — Reverse Order)

**CRITICAL: Messages MUST be processed in reverse order (last → first)**

This is the core of MACI's anti-collusion. Forward processing would allow bribers to know if their coerced vote was the final one.

**Message Validity Rules** (ALL must be satisfied):
1. `stateIndex < numSignUps` (range valid)
2. EdDSA signature valid with **current** state leaf's pubKey
3. `nonce === ballot.nonce + 1`
4. `voiceCreditBalance + (currentWeight² - newWeight²) >= 0`
5. `voteOptionIndex < maxVoteOptions`
6. `newVoteWeight < sqrt(SNARK_SCALAR_FIELD)` (overflow prevention)
7. Timestamp valid (after registration)

**Invalid Message Handling** (NOT a simple skip):
- Command is applied to **index 0 (blank state leaf)** instead of target index
- Blank leaf has infinite credits + special pubKey → any command "succeeds" but has no real effect
- This routing is proven inside the ZK circuit → Coordinator cannot arbitrarily accept/reject

**Public Input** (SHA256 compressed):
```
inputHash = SHA256(
  inputStateRoot, outputStateRoot,
  inputBallotRoot, outputBallotRoot,
  inputMessageRoot,
  coordinatorPubKeyHash,
  batchStartIndex, batchEndIndex
) % SNARK_SCALAR_FIELD
```

### Tallying

After all messages are processed, the Coordinator tallies votes in batches.

**D1 mode**: `forVotes += votingPower` (1:1 voting power)
**D2 mode**: `forVotes += numVotes` (quadratic cost: numVotes² credits)

**Tally Commitment** (3-input Poseidon):
```
tallyCommitment = Poseidon3(votesRoot, totalSpentVoiceCredits, perVoteOptionSpentRoot)
```

**Finalized Output**: Only aggregate results are published on-chain
```
{ forVotes, againstVotes, abstainVotes(D1 only), totalVoters }
```
Individual vote choices are **permanently private** — never revealed.

---

## Cryptographic Primitives

| Primitive | Usage | Library |
|-----------|-------|---------|
| **Poseidon DuplexSponge** | Message encryption/decryption (t=4, rate=3) | circomlibjs permutation |
| **ECDH** (Baby Jubjub) | Shared key generation (voter ↔ coordinator) | circomlibjs mulPointEscalar |
| **EdDSA** (Poseidon-based) | Command signing & verification | circomlibjs signPoseidon |
| **BLAKE2b-512** | Private key derivation (seed → Baby Jubjub scalar) | @noble/hashes |
| **SHA256** | Public input compression for on-chain verification | circom sha256 |
| **Poseidon** (various arities) | State leaf, ballot, command, tally hashing | circomlibjs |

### Key Formulas

```
State Leaf:     Poseidon4(pubKeyX, pubKeyY, voiceCreditBalance, timestamp)
Ballot Hash:    Poseidon2(nonce, voteOptionRoot)
Command Hash:   Poseidon4(packedValues, newPubKeyX, newPubKeyY, salt)
Tally Commit:   Poseidon3(votesRoot, totalSpent, perOptionSpent)
Message Leaf:   Poseidon(Poseidon5(enc[0..4]), Poseidon5(enc[5..9]), encPubKeyX, encPubKeyY)
Blank Leaf:     Pedersen generator-based constant (MACI defined)
```

---

## Integration with D1/D2

MACI wraps both D1 and D2. The voting mode determines:

| Aspect | D1 (Private Voting) | D2 (Quadratic Voting) |
|--------|---------------------|----------------------|
| **Choice** | {0=against, 1=for, 2=abstain} | {0=against, 1=for} (binary only) |
| **Weight** | votingPower (1:1 with tokens) | numVotes (cost = numVotes²) |
| **Cost** | Linear (weight = cost) | Quadratic (cost = weight²) |
| **Commitment** | Poseidon4(choice, votingPower, proposalId, voteSalt) | Poseidon5(choice, numVotes, creditsSpent, proposalId, voteSalt) |
| **Credit check** | balance >= votingPower | balance >= numVotes² |
| **Abstain** | Yes (choice=2) | No |

**In MACI context**:
- `newVoteWeight` in Command = D1's `votingPower` or D2's `numVotes`
- `voteOptionIndex` in Command = `proposalId`
- Credit verification uses D1 or D2 cost function depending on poll mode

---

## Reveal Phase: REMOVED

**V1 had reveal. V2 (MACI) does NOT.**

- `revealVote*()` functions: **DELETED**
- `VoteRevealed*` events: **DELETED**
- Individual vote choices are **NEVER** recorded in plaintext on-chain
- Only aggregate results (`forVotes`, `againstVotes`) are published after tally verification
- This is what makes votes **permanently private**, not just temporarily hidden

---

## Coordinator Role

The Coordinator is a semi-trusted role that:
1. Holds a private key to decrypt messages
2. Processes messages in reverse order (off-chain)
3. Generates ZK proofs for state transitions and tallying
4. Submits proofs on-chain for verification

**Trust assumptions**:
- Coordinator CAN see individual votes (necessary for processing)
- Coordinator CANNOT forge votes (EdDSA signatures required)
- Coordinator CANNOT censor votes (AccQueue is immutable; omission causes proof failure)
- Coordinator CANNOT produce incorrect tally (on-chain ZK verification)
- Coordinator's ONLY trust assumption: they won't **collude with bribers by revealing individual votes**

---

## Effects

| Aspect | Impact |
|--------|--------|
| **Anti-Bribery** | Key change makes vote buying economically irrational |
| **Anti-Coercion** | Voters can secretly override forced votes |
| **Permanent Privacy** | Individual votes never appear on-chain, even after voting ends |
| **Verifiable Tally** | ZK proofs ensure correct aggregation without revealing individuals |
| **Censorship Resistant** | On-chain AccQueue makes vote omission provably detectable |

---

## Security Considerations

| Risk | Mitigation |
|------|-----------|
| **Coordinator collusion** | Coordinator can see votes but cannot forge them; trust-minimized via ZK |
| **Coordinator unavailability** | processDeadline allows replacement coordinator |
| **Sybil registration** | SignUpGatekeeper restricts who can register |
| **Replay attacks** | nonce must equal ballot.nonce + 1; salt provides uniqueness |
| **State tree overflow** | Quinary depth 10 supports ~9.7M users |
| **Gas limit on merge** | Incremental mergeSubRoots with configurable batch size |
| **Front-running key change** | Messages are encrypted; observer cannot distinguish key change from vote |

---

## Implementation Challenges

1. **Reverse Order Processing**
   - Coordinator must reconstruct full state off-chain
   - Batch processing with ZK proof per batch
   - State/Ballot tree updates must exactly match circuit expectations

2. **DuplexSponge Compatibility**
   - TypeScript (circomlibjs permutation) must produce identical output to Circom circuit
   - Field arithmetic: addition in TS ↔ addition in circuit (both mod p)

3. **AccQueue Merge Gas**
   - Large voter sets require multiple merge transactions
   - numSrQueueOps parameter controls gas per call

4. **Circuit Compilation**
   - MessageProcessor requires pot18 (powers of tau)
   - TallyVotes requires pot17
   - Dev params: stateTreeDepth=2, batchSize=2
   - Production params: stateTreeDepth=10, batchSize=5

---

## Deployed Contracts (Sepolia)

### MACI V2 (ERC20VoiceCreditProxy + Real Groth16 - 2026-02-16)
- MACI: `0x70e53036f8c00ce3A20e56e39329a8895704d9cd`
- MsgProcessorVerifier: `0x12dC8d2c694a1143f031AE1BF593BD8830F9E9DA`
- TallyVerifier: `0xF5f89ab2EAb0fDE3007848Afe5dA4277ad8d0a9E`
- VkRegistry: `0x9d218D58721b8Ceab46FE1B294B8D4346416F4e8`
- AccQueue: (deployed with MACI)
- Gatekeeper: `0x4c18984A78910Dd1976d6DFd820f6d18e7edD672`
- VoiceCreditProxy: `0xa648fd654E1af99aAA2926Cf7B6913Ec7652Ef39` (ERC20-based)
- TON Token: `0xa30fe40285B8f5c0457DbC3B7C8A280373c40044`

---

## Use Cases

1. **DAO Treasury Votes** — Members vote on fund allocation; whales cannot buy favorable outcomes
2. **Protocol Governance** — Parameter changes decided by token holders; no coercion possible
3. **Grant Allocation** — QV-based funding with anti-collusion; fair distribution without collusion rings
4. **Contentious Proposals** — Private voting removes social pressure; true community sentiment emerges
