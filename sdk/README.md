# sigil-sdk

Private, fair, collusion-resistant governance SDK for DAOs.

Built on Ethereum with ZK-SNARKs (Groth16), MACI anti-collusion, and quadratic voting.

## Quick Start

```ts
import { SigilClient } from 'sigil-sdk';
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
| **Quadratic voting** | Cost = votes² for fair influence distribution |
| **On-chain verified** | Groth16 proofs verified on Ethereum |
| **Auto-registration** | `vote()` auto-calls `signUp()` if needed |
| **Auto key change** | Re-votes automatically change EdDSA key |

## API Reference

### `SigilClient`

#### `new SigilClient(config)`

```ts
interface SigilConfig {
  maciAddress: string;          // MACI contract address
  provider: ethers.Provider;    // Ethers provider
  signer?: ethers.Signer;      // Ethers signer (for write ops)
  coordinatorPubKey?: [bigint, bigint]; // Override on-chain value
  storage?: SigilStorage;       // Custom storage (default: localStorage)
}
```

#### `signUp(signatureHex?): Promise<SignUpResult>`

Register for MACI voting. Derives EdDSA keypair from wallet signature.

#### `vote(pollId, choice, numVotes?, options?): Promise<VoteReceipt>`

Cast a vote. Auto-registers and auto-changes key on re-vote.

- `choice`: `'for' | 'against' | 'abstain'`
- `numVotes`: Vote weight (cost = numVotes², default: 1)
- `options.autoRegister`: Auto-signUp if needed (default: true)
- `options.autoKeyChange`: Change key on re-vote (default: true)

#### `changeKey(pollId): Promise<KeyChangeResult>`

Explicitly change EdDSA key for anti-collusion.

#### `getPolls(): Promise<Poll[]>`

List all proposals with status.

#### `getResults(pollId): Promise<PollResults | null>`

Get finalized voting results.

### Crypto Primitives

Available for advanced use:

```ts
import {
  // ECDH
  generateECDHSharedKey, generateEphemeralKeyPair, derivePublicKey,
  // Encryption
  poseidonEncrypt, poseidonDecrypt,
  // Signing
  eddsaSign, eddsaVerify, eddsaDerivePublicKey,
  // Key derivation
  derivePrivateKey, generateRandomPrivateKey,
  // Command packing
  packCommand, unpackCommand, computeCommandHash,
  // Message building
  buildEncryptedVoteMessage, buildEncryptedKeyChangeMessage,
  // Storage
  MemoryStorage, KeyManager, createStorageKeys,
} from 'sigil-sdk';
```

## Error Handling

```ts
try {
  await sigil.vote(0, 'for', 3);
} catch (err) {
  if (err.message.includes('Signer required')) {
    // Connect wallet first
  } else if (err.message.includes('not registered')) {
    // Call signUp() first
  }
}
```

## Custom Storage (Node.js)

```ts
import { SigilClient, MemoryStorage } from 'sigil-sdk';

const sigil = new SigilClient({
  maciAddress: '0x...',
  provider,
  signer,
  storage: new MemoryStorage(), // In-memory for Node.js
});
```

## Network

Currently deployed on **Sepolia testnet**.

## License

MIT
