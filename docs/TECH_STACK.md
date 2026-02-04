# Tech Stack

## Overview

zkDEX D1 Private Voting Demo에서 사용된 기술 스택입니다.

## Frontend Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI 컴포넌트 라이브러리 |
| TypeScript | 5.x | 타입 안정성을 위한 JavaScript 슈퍼셋 |
| Vite | 5.x | 빌드 도구 및 개발 서버 |

### React
- 컴포넌트 기반 UI 구조
- 상태 관리를 위한 useState Hook
- 조건부 렌더링으로 페이지 전환

### TypeScript
- 타입 정의로 런타임 에러 방지
- IDE 자동완성 지원
- 코드 유지보수성 향상

### Vite
- 빠른 HMR (Hot Module Replacement)
- ES 모듈 기반 개발 서버
- 최적화된 프로덕션 빌드

## Web3 Integration

| Technology | Version | Purpose |
|------------|---------|---------|
| wagmi | 2.x | React Hooks for Ethereum |
| viem | 2.x | Ethereum 인터랙션 라이브러리 |
| @tanstack/react-query | 5.x | 비동기 상태 관리 |

### wagmi
```typescript
// wagmi.ts
import { http, createConfig } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [sepolia, mainnet],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
})
```

### Supported Wallets
- MetaMask
- Coinbase Wallet
- WalletConnect 호환 지갑
- 기타 Injected Wallet

## Styling

| Technology | Purpose |
|------------|---------|
| CSS3 | 스타일링 |
| CSS Grid | 레이아웃 |
| CSS Flexbox | 컴포넌트 정렬 |
| CSS Variables | 테마 색상 관리 |

### CSS 구조
```css
/* 색상 변수 예시 */
:root {
  --primary-color: #6366f1;
  --background-color: #0f0f23;
  --card-background: #1a1a2e;
}
```

## Development Tools

| Tool | Purpose |
|------|---------|
| npm | 패키지 관리 |
| ESLint | 코드 품질 검사 |
| Git | 버전 관리 |

## Network Configuration

| Network | Chain ID | Purpose |
|---------|----------|---------|
| Ethereum Sepolia | 11155111 | 테스트넷 |
| Ethereum Mainnet | 1 | 메인넷 (참조용) |

## Dependencies

### package.json 주요 의존성

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
    "vite": "^5.x"
  }
}
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | ✅ 권장 |
| Firefox | ✅ 지원 |
| Safari | ✅ 지원 |
| Edge | ✅ 지원 |

**요구사항**: Web3 지갑 확장 프로그램 (MetaMask 등)

## Future Tech (Production)

프로덕션 구현 시 추가될 기술:

| Technology | Purpose |
|------------|---------|
| Circom | ZK Circuit 작성 |
| snarkjs | ZK Proof 생성/검증 |
| Solidity | 스마트 컨트랙트 |
| IPFS | 분산 저장소 |
| Hardhat | 컨트랙트 개발 환경 |
