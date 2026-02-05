# Tech Stack

## Overview

zkDEX D1 Private Voting에서 사용된 기술 스택입니다.

## ZK (Zero-Knowledge) Layer

| Technology | Version | Purpose |
|------------|---------|---------|
| Circom | 2.1.6 | ZK 회로 작성 언어 |
| snarkjs | - | Groth16 증명 생성/검증 |
| circomlib | - | Poseidon, Baby Jubjub 등 라이브러리 |

### Circom Circuit

```circom
// circuits/PrivateVoting.circom
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";

template PrivateVoting(merkleTreeDepth) {
    // 4 public inputs (D1 spec)
    signal input voteCommitment;
    signal input proposalId;
    signal input votingPower;
    signal input merkleRoot;
    // ... private inputs
}

component main {public [voteCommitment, proposalId, votingPower, merkleRoot]}
    = PrivateVoting(20);
```

### Cryptographic Primitives

| Primitive | Implementation | Purpose |
|-----------|----------------|---------|
| Poseidon Hash | circomlib | ZK-friendly hash function |
| Baby Jubjub | circomlib | Elliptic curve for key derivation |
| Merkle Tree | Custom | 20-level proof of inclusion |
| Groth16 | snarkjs | SNARK proof system |

## Frontend Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI 컴포넌트 라이브러리 |
| TypeScript | 5.x | 타입 안정성 |
| Vite | 5.x | 빌드 도구 |

### React Hooks

```typescript
// ZK 상태 관리
const [keyPair, setKeyPair] = useState<KeyPair | null>(null)
const [tokenNote, setTokenNote] = useState<TokenNote | null>(null)
const [voteData, setVoteData] = useState<VoteData | null>(null)
```

### TypeScript Interfaces

```typescript
// src/zkproof.ts
interface KeyPair {
  sk: bigint        // Secret key
  pkX: bigint       // Public key X
  pkY: bigint       // Public key Y
}

interface TokenNote {
  noteHash: bigint
  noteValue: bigint
  noteSalt: bigint
  tokenType: bigint
  pkX: bigint
  pkY: bigint
}

interface VoteData {
  choice: VoteChoice
  votingPower: bigint
  voteSalt: bigint
  proposalId: bigint
  commitment: bigint
  nullifier: bigint
}
```

## Web3 Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| wagmi | 2.x | React Hooks for Ethereum |
| viem | 2.x | Ethereum interaction |
| @tanstack/react-query | 5.x | Async state management |

### wagmi Configuration

```typescript
// wagmi.ts
import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http('https://sepolia.drpc.org'),
  },
})
```

### Supported Wallets

- MetaMask
- Coinbase Wallet
- WalletConnect 호환 지갑

## Smart Contract

| Technology | Version | Purpose |
|------------|---------|---------|
| Solidity | 0.8.24 | 스마트 컨트랙트 언어 |
| Hardhat | - | 개발/배포 도구 |

### Contract Interface

```solidity
// contracts/PrivateVoting.sol
interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals  // 4 public inputs
    ) external view returns (bool);
}

contract PrivateVoting {
    function commitVote(
        uint256 _proposalId,
        uint256 _commitment,
        uint256 _votingPower,
        uint256 _nullifier,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external;

    function revealVote(
        uint256 _proposalId,
        uint256 _nullifier,
        uint256 _choice,
        uint256 _voteSalt
    ) external;
}
```

## Styling

| Technology | Purpose |
|------------|---------|
| CSS3 | 스타일링 |
| CSS Grid | 레이아웃 |
| CSS Variables | 테마 관리 |

### CSS Variables

```css
:root {
  --primary-color: #6366f1;
  --background-color: #0f0f23;
  --card-background: #1a1a2e;
  --success-color: #22c55e;
  --danger-color: #ef4444;
  --warning-color: #eab308;
}
```

## Development Tools

| Tool | Purpose |
|------|---------|
| npm | 패키지 관리 |
| ESLint | 코드 품질 |
| Git | 버전 관리 |
| circom CLI | 회로 컴파일 |
| snarkjs CLI | 증명 생성 |

## Network Configuration

| Network | Chain ID | RPC |
|---------|----------|-----|
| Sepolia | 11155111 | https://sepolia.drpc.org |

## Dependencies

### package.json

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "wagmi": "^2.x",
    "viem": "^2.x",
    "@tanstack/react-query": "^5.x"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@vitejs/plugin-react": "^4.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "hardhat": "^2.x"
  }
}
```

## Circuit Compilation (Optional)

```bash
# Install circom
curl -Ls https://scrypt.io/scripts/circom.sh | sh

# Compile circuit
cd circuits
circom PrivateVoting.circom --r1cs --wasm --sym -o build/

# Generate proving key (Powers of Tau required)
snarkjs groth16 setup build/PrivateVoting.r1cs pot_final.ptau build/PrivateVoting.zkey

# Export verifier
snarkjs zkey export verifier build/PrivateVoting.zkey build/Verifier.sol
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | Recommended |
| Firefox | Supported |
| Safari | Supported |
| Edge | Supported |

**Requirement**: Web3 wallet extension (MetaMask recommended)

## File Structure

```
zk-dex-d1-private-voting/
├── circuits/                 # ZK Circuits
│   ├── PrivateVoting.circom  # D1 spec circuit
│   └── compile.sh            # Compilation script
├── contracts/                # Smart Contracts
│   └── PrivateVoting.sol     # Commit-reveal contract
├── src/                      # Frontend
│   ├── App.tsx               # Main component
│   ├── zkproof.ts            # ZK proof module
│   ├── contract.ts           # ABI + address
│   └── wagmi.ts              # Wallet config
├── test/                     # Tests
│   └── PrivateVoting.test.ts
└── docs/                     # Documentation
```
