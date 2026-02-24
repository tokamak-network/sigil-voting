# @sigil/sdk

Private, fair, collusion-resistant governance SDK for DAOs.

Built on Ethereum with ZK-SNARKs (Groth16), MACI anti-collusion, and quadratic voting.

## Installation

```bash
npm install @sigil/sdk ethers
```

For React widget support:

```bash
npm install @sigil/sdk ethers react react-dom
```

> **TypeScript**: Full type definitions are included. No `@types` package needed.

## Quick Start

```ts
import { SigilClient } from '@sigil/sdk';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/YOUR_KEY');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

const sigil = new SigilClient({
  maciAddress: '0x26428484F192D1dA677111A47615378Bc889d441',
  provider,
  signer,
});

// Register (generates EdDSA keypair from wallet signature)
await sigil.signUp();

// Vote: 3 votes FOR = 9 credits (quadratic cost)
const receipt = await sigil.vote(0, 'for', 3);
console.log('Vote tx:', receipt.txHash);

// Get results (after coordinator finalization)
const results = await sigil.getResults(0);
```

## Features

| Feature | Description |
|---------|-------------|
| **Private voting** | Individual votes are permanently hidden (ZK-SNARK) |
| **Anti-collusion** | MACI key change prevents bribery and coercion |
| **Quadratic voting** | Cost = votes^2 for fair influence distribution |
| **On-chain verified** | Groth16 proofs verified on Ethereum |
| **Auto-registration** | `vote()` auto-calls `signUp()` if needed |
| **Auto key change** | Re-votes automatically change EdDSA key for anti-collusion |
| **Delegation** | Optional vote delegation via DelegationRegistry |
| **Timelock execution** | On-chain governance execution with timelock |

## Entry Points

The SDK provides four entry points for different use cases:

| Import Path | Description |
|---|---|
| `@sigil/sdk` | Main client, types, storage, key management, command packing, crypto |
| `@sigil/sdk/widget` | Framework-agnostic embeddable voting widget (pure DOM) |
| `@sigil/sdk/react` | React component and hook for the voting widget |
| `@sigil/sdk/crypto` | Low-level cryptographic primitives (ECDH, EdDSA, Poseidon) |

## API Reference

### `SigilClient`

The main SDK class for interacting with SIGIL voting contracts.

#### Constructor

```ts
import { SigilClient, type SigilConfig } from '@sigil/sdk';

const sigil = new SigilClient(config: SigilConfig);
```

```ts
interface SigilConfig {
  maciAddress: string;                    // MACI contract address
  provider: ethers.Provider;              // Ethers provider
  signer?: ethers.Signer;                // Ethers signer (for write ops)
  coordinatorPubKey?: [bigint, bigint];   // Override on-chain value
  deployBlock?: number | bigint;          // MACI deploy block (for fast log scans)
  logChunkSize?: number;                  // Log chunk size (default: 2000 blocks)
  storage?: SigilStorage;                 // Custom storage backend
  timelockExecutorAddress?: string;       // TimelockExecutor contract
  delegationRegistryAddress?: string;     // DelegationRegistry contract
}
```

#### `signUp(signatureHex?): Promise<SignUpResult>`

Register for MACI voting. Derives an EdDSA keypair from a wallet signature.

```ts
const result = await sigil.signUp();
console.log('State index:', result.stateIndex);
console.log('Public key:', result.pubKey);
```

#### `vote(pollId, choice, numVotes?, options?): Promise<VoteReceipt>`

Cast a vote. Auto-registers and auto-changes key on re-vote.

- `choice`: `'for' | 'against' | 'abstain'`
- `numVotes`: Vote weight (cost = numVotes^2, default: 1)
- `options.autoRegister`: Auto-signUp if needed (default: true)
- `options.autoKeyChange`: Change key on re-vote (default: true)

```ts
// 3 votes FOR = 9 credits (quadratic cost)
const receipt = await sigil.vote(0, 'for', 3);
console.log('Tx:', receipt.txHash);
console.log('Credits spent:', receipt.creditsSpent); // 9
```

#### `changeKey(pollId): Promise<KeyChangeResult>`

Explicitly change EdDSA key for anti-collusion. Generates a new random keypair and submits a key change message.

```ts
const result = await sigil.changeKey(0);
console.log('New public key:', result.newPubKey);
```

#### `getPolls(): Promise<Poll[]>`

List all proposals with their status.

```ts
const polls = await sigil.getPolls();
for (const poll of polls) {
  console.log(`#${poll.id}: ${poll.status} (${poll.numMessages} messages)`);
}
```

#### `getPoll(pollId): Promise<Poll | null>`

Get a single poll by ID.

#### `getResults(pollId): Promise<PollResults | null>`

Get finalized voting results. Returns `null` if not yet finalized.

```ts
const results = await sigil.getResults(0);
if (results) {
  console.log('For:', results.forVotes);
  console.log('Against:', results.againstVotes);
  console.log('Total voters:', results.totalVoters);
}
```

#### `getResultsStatus(pollId): Promise<ResultsStatus>`

Get results with status (`missing | pending | finalized`) and tally address.

```ts
const status = await sigil.getResultsStatus(0);
if (status.status === 'finalized') {
  console.log('Final results:', status.results);
} else {
  console.log('Status:', status.status, '| Tally:', status.tallyAddress);
}
```

#### `getPollCount(): Promise<number>`

Get total number of deployed polls.

#### `getTallyAddress(pollId): Promise<string | null>`

Get the tally contract address for a poll from on-chain DeployPoll events.

#### Governance: Timelock Execution

Requires `timelockExecutorAddress` in config.

```ts
await sigil.registerExecution(pollId, tallyAddr, target, callData, delay, quorum);
await sigil.schedule(pollId);
await sigil.execute(pollId);
await sigil.cancelExecution(pollId);
const state = await sigil.getExecutionState(pollId);
// state: 'none' | 'registered' | 'scheduled' | 'executed' | 'cancelled'
```

#### Governance: Delegation

Requires `delegationRegistryAddress` in config.

```ts
await sigil.delegate('0x...');
await sigil.undelegate();
const delegate = await sigil.getDelegate();
const isDelegating = await sigil.isDelegating();
```

#### `getKeyManager(): KeyManager`

Access the internal key manager for advanced key operations.

---

### Widget (Framework-Agnostic)

Embeddable voting widget using pure DOM manipulation. No framework dependency.

```ts
import { mountSigilWidget } from '@sigil/sdk/widget';

const widget = mountSigilWidget({
  maciAddress: '0x26428484F192D1dA677111A47615378Bc889d441',
  pollId: 0,
  target: '#vote-container',  // CSS selector or HTMLElement
  theme: 'dark',              // 'light' | 'dark' | 'auto'
  lang: 'en',                 // 'en' | 'ko'
  onVote: (receipt) => console.log('Voted!', receipt),
  onResults: (results) => console.log('Results:', results),
  onError: (error) => console.error(error),
});

// Later: cleanup
widget.unmount();

// Or: force refresh
await widget.refresh();
```

#### HTML Data Attributes (Auto-Mount)

```html
<div
  data-sigil-maci="0x26428484F192D1dA677111A47615378Bc889d441"
  data-sigil-poll="0"
  data-sigil-theme="dark"
  data-sigil-lang="en"
></div>

<script type="module">
  import { autoMount } from '@sigil/sdk/widget';
  autoMount(); // Scans DOM and mounts widgets automatically
</script>
```

---

### React Component

React wrapper with proper lifecycle management.

```tsx
import { SigilVoteWidget } from '@sigil/sdk/react';

function App() {
  return (
    <SigilVoteWidget
      maciAddress="0x26428484F192D1dA677111A47615378Bc889d441"
      pollId={0}
      theme="auto"
      lang="en"
      onVoteSubmitted={(receipt) => console.log('Voted!', receipt)}
      onResults={(results) => console.log('Results:', results)}
      onError={(error) => console.error(error)}
      className="my-widget"
    />
  );
}
```

#### `useSigilWidget` Hook

For imperative control over the widget:

```tsx
import { useSigilWidget } from '@sigil/sdk/react';

function MyComponent() {
  const { ref, handle } = useSigilWidget({
    maciAddress: '0x...',
    pollId: 0,
  });

  return (
    <div>
      <div ref={ref} />
      <button onClick={() => handle.current?.refresh()}>
        Refresh
      </button>
    </div>
  );
}
```

#### Pre-connected Provider/Signer

Pass an existing provider and signer to skip the wallet connection step:

```tsx
import { SigilVoteWidget } from '@sigil/sdk/react';
import { useWalletClient } from 'wagmi';
import { BrowserProvider } from 'ethers';

function VotingPanel({ pollId }: { pollId: number }) {
  const { data: walletClient } = useWalletClient();

  const provider = walletClient
    ? new BrowserProvider(walletClient.transport)
    : undefined;

  const signer = provider
    ? provider.getSigner()
    : undefined;

  return (
    <SigilVoteWidget
      maciAddress="0x..."
      pollId={pollId}
      provider={provider}
      signer={signer}
    />
  );
}
```

---

### Crypto Primitives

Available for advanced use via `@sigil/sdk/crypto` or the main entry point:

```ts
import {
  // ECDH (Baby Jubjub)
  generateECDHSharedKey,
  generateEphemeralKeyPair,
  derivePublicKey,
  BABYJUB_SUBORDER,

  // Poseidon Encryption (DuplexSponge)
  poseidonEncrypt,
  poseidonDecrypt,

  // EdDSA Signatures (Poseidon hash)
  eddsaSign,
  eddsaVerify,
  eddsaDerivePublicKey,

  // Key Derivation (BLAKE2b-512)
  derivePrivateKey,
  generateRandomPrivateKey,
  derivePrivateKeyFromSignature,
} from '@sigil/sdk/crypto';
```

#### ECDH Key Exchange

```ts
const ephemeral = await generateEphemeralKeyPair();
const sharedKey = await generateECDHSharedKey(ephemeral.sk, coordinatorPubKey);
```

#### Poseidon Encryption

```ts
const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);
const decrypted = await poseidonDecrypt(ciphertext, sharedKey, nonce, plaintext.length);
```

#### EdDSA Signatures

```ts
const signature = await eddsaSign(messageHash, privateKey);
const isValid = await eddsaVerify(messageHash, signature, publicKey);
const pubKey = await eddsaDerivePublicKey(privateKey);
```

#### Key Derivation

```ts
// From wallet signature bytes
const sk = derivePrivateKey(signatureBytes);

// Random
const randomSk = generateRandomPrivateKey();

// Convenience wrapper
const sk2 = derivePrivateKeyFromSignature(signatureBytes);
```

---

### Message Building

Build encrypted messages ready for MACI `publishMessage()`:

```ts
import {
  buildEncryptedVoteMessage,
  buildEncryptedKeyChangeMessage,
  packCommand,
  unpackCommand,
  computeCommandHash,
  generateSalt,
} from '@sigil/sdk';

// Build encrypted vote
const { encMessage, ephemeralPubKey } = await buildEncryptedVoteMessage({
  stateIndex: 1n,
  voteOptionIndex: 1n,  // 0=against, 1=for
  newVoteWeight: 3n,    // 3 votes = 9 credits
  nonce: 1n,
  pollId: 0n,
  voterSk: myPrivateKey,
  voterPubKey: myPublicKey,
  coordinatorPubKey: coordPubKey,
});

// Submit on-chain
await pollContract.publishMessage(encMessage, ephemeralPubKey[0], ephemeralPubKey[1]);
```

---

### Storage

The SDK uses pluggable storage for keypair persistence.

```ts
import { MemoryStorage, BrowserStorage, createDefaultStorage } from '@sigil/sdk';

// Browser: uses localStorage automatically
const sigil = new SigilClient({ maciAddress, provider, signer });

// Node.js / Testing: use in-memory storage
const sigil = new SigilClient({
  maciAddress,
  provider,
  signer,
  storage: new MemoryStorage(),
});

// Custom storage: implement SigilStorage interface
const customStorage: SigilStorage = {
  getItem(key: string): string | null { /* ... */ },
  setItem(key: string, value: string): void { /* ... */ },
  removeItem(key: string): void { /* ... */ },
};
```

---

## Error Handling

```ts
try {
  await sigil.vote(0, 'for', 3);
} catch (err) {
  if (err.message.includes('Signer required')) {
    // Connect wallet first
  } else if (err.message.includes('not registered')) {
    // Call signUp() first — or enable autoRegister (default)
  }
}
```

## Network

Currently deployed on **Sepolia testnet**.

- MACI contract: `0x26428484F192D1dA677111A47615378Bc889d441`
- Explorer: [sigil.vote](https://sigil.vote)

## TypeScript

The SDK is written in TypeScript and ships with full type definitions. All public APIs have JSDoc comments for IDE autocompletion.

```ts
import type {
  SigilConfig,
  Poll,
  PollStatus,
  PollResults,
  VoteChoice,
  VoteReceipt,
  SignUpResult,
  KeyChangeResult,
  WidgetConfig,
  WidgetHandle,
  SigilStorage,
  MaciKeypair,
  PubKey,
  EdDSASignature,
  MessageParams,
  EncryptedMessage,
} from '@sigil/sdk';
```

## Browser Support

- Modern browsers with ES2022 support
- Requires `crypto.getRandomValues` (Web Crypto API)
- Works with any Ethereum wallet that injects `window.ethereum`

## Node.js Support

- Node.js >= 18.0.0
- Use `MemoryStorage` instead of default `BrowserStorage`
- Requires `ethers` v6+

## License

MIT
