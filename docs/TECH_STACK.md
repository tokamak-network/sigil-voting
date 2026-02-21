# Tech Stack

## Overview

zkDEX D1 Private Voting에서 사용된 기술 스택입니다.

## ZK (Zero-Knowledge) Layer

| Technology | Version | Purpose |
|------------|---------|---------|
| Circom | 2.1.6 | ZK 회로 작성 언어 |
| snarkjs | - | Groth16 증명 생성/검증 |
| circomlib | - | Poseidon, Baby Jubjub 등 라이브러리 |

### Circom Circuit (MACI)

```circom
// circuits/MessageProcessor.circom
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";

template MessageProcessor() {
    // MACI state transition verification
    // (encrypted votes, key change, reverse processing)
}
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
| React | 19.x | UI 컴포넌트 라이브러리 |
| Next.js | 15.x | App Router + 빌드/서빙 |
| TypeScript | 5.x | 타입 안정성 |

### Frontend State (MACI)

```typescript
// Example state for encrypted voting flow (MACI)
const [isRegistered, setIsRegistered] = useState(false)
const [voiceCredits, setVoiceCredits] = useState(0)
const [phase, setPhase] = useState<'voting' | 'merging' | 'processing' | 'finalized' | 'failed' | 'noVotes'>('voting')
```

Key material is stored client-side using encrypted localStorage (`src/crypto/keyStore.ts`).

## Web3 Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| wagmi | 3.x | React Hooks for Ethereum |
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

### Contract Interface (MACI)

```solidity
interface IMACI {
    function signUp(uint256 _pubKeyX, uint256 _pubKeyY, bytes calldata _gatekeeperData, bytes calldata _creditData) external;
    function deployPoll(
        string calldata _title,
        uint256 _duration,
        uint256 _coordinatorPubKeyX,
        uint256 _coordinatorPubKeyY,
        address _mpVerifier,
        address _tallyVerifier,
        address _vkRegistry,
        uint8 _messageTreeDepth
    ) external;
}

interface IPoll {
    function publishMessage(uint256[10] calldata _encMessage, uint256 _encPubKeyX, uint256 _encPubKeyY) external;
}

interface ITally {
    function tallyVerified() external view returns (bool);
    function forVotes() external view returns (uint256);
    function againstVotes() external view returns (uint256);
    function totalVoters() external view returns (uint256);
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
    "react": "^19.x",
    "react-dom": "^19.x",
    "next": "^15.x",
    "wagmi": "^3.x",
    "viem": "^2.x",
    "@tanstack/react-query": "^5.x"
  },
  "devDependencies": {
    "@types/react": "^19.x",
    "@types/react-dom": "^19.x",
    "typescript": "^5.x",
    "hardhat": "^2.x"
  }
}
```

## Circuit Compilation (Optional)

```bash
# Install circom
curl -Ls https://scrypt.io/scripts/circom.sh | sh

# Compile circuits
cd circuits
circom MessageProcessor.circom --r1cs --wasm --sym -o build_maci/
circom TallyVotes.circom --r1cs --wasm --sym -o build_maci/

# Generate proving key (Powers of Tau required)
snarkjs groth16 setup build_maci/MessageProcessor.r1cs pot_final.ptau build_maci/MessageProcessor.zkey
snarkjs groth16 setup build_maci/TallyVotes.r1cs pot_final.ptau build_maci/TallyVotes.zkey

# Export verifier
snarkjs zkey export verifier build_maci/MessageProcessor.zkey build_maci/MessageProcessorVerifier.sol
snarkjs zkey export verifier build_maci/TallyVotes.zkey build_maci/TallyVerifier.sol
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
sigil/
├── app/                      # Next App Router
├── src/                      # Frontend modules
│   ├── components/           # UI + voting flows
│   ├── crypto/               # ECDH/EdDSA/DuplexSponge utilities
│   ├── workers/              # ZK worker helpers
│   ├── contractV2.ts         # MACI ABIs + addresses
│   └── wagmi.ts              # Wallet config
├── circuits/                 # ZK circuits (D1/D2/MACI)
├── contracts/                # MACI/Poll/MessageProcessor/Tally
├── coordinator/              # Off-chain coordinator (prove + tally)
├── test/                     # Unit tests
└── docs/                     # Documentation
```
