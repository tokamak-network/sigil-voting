# ZK Private Voting SDK - Integration Plan

> 작성일: 2026-02-12
> 목표: 다른 Web3 서비스에서 쉽게 ZK Private Voting을 통합할 수 있도록 SDK 제공

---

## 배경

현재 ZK Private Voting은 독립형 dApp으로 구현되어 있습니다. 다른 Web3 프로젝트(DAO, DeFi, NFT 커뮤니티 등)에서 쉽게 투표 기능을 추가할 수 있도록 SDK 형태로 제공하려 합니다.

---

## 통합 방식 비교

| 방식 | 장점 | 단점 | 난이도 | 추천 |
|------|------|------|--------|------|
| **1. NPM SDK** | 완전한 커스터마이징 | 개발자만 사용 가능 | 중 | ✅ |
| **2. Embed Widget** | 비개발자도 사용 | 커스터마이징 제한 | 하 | ✅ |
| **3. REST API** | 언어 무관 | 서버 운영 필요 | 상 | ❌ |
| **4. Contract Only** | 가장 유연 | ZK 증명 생성 어려움 | 상 | ❌ |

### 권장: 1번 + 2번 병행

---

## Option 1: NPM SDK 패키지

### 설치
```bash
npm install @zkprivate/voting-sdk
# 또는
yarn add @zkprivate/voting-sdk
```

### 사용 예시

#### React Hook 방식
```tsx
import { useZkVoting, ZkVotingProvider } from '@zkprivate/voting-sdk';

function App() {
  return (
    <ZkVotingProvider
      contractAddress="0x..."
      chainId={11155111}
    >
      <VotingPage />
    </ZkVotingProvider>
  );
}

function VotingPage() {
  const {
    createProposal,
    vote,
    reveal,
    proposals,
    isLoading
  } = useZkVoting();

  const handleVote = async () => {
    await vote({
      proposalId: 1,
      choice: true,      // 찬성
      voteCount: 5,      // Quadratic: 5표 = 25 TON
    });
  };

  return (
    <button onClick={handleVote}>투표하기</button>
  );
}
```

#### 컴포넌트 방식 (더 쉬움)
```tsx
import {
  VotingWidget,
  ProposalList,
  CreateProposalButton
} from '@zkprivate/voting-sdk/react';

function MyDAO() {
  return (
    <div>
      <h1>My DAO Governance</h1>
      <CreateProposalButton />
      <ProposalList />
      <VotingWidget proposalId={1} />
    </div>
  );
}
```

### SDK 구조
```
@zkprivate/voting-sdk/
├── core/           # 핵심 로직 (프레임워크 무관)
│   ├── zkproof.ts      # ZK 증명 생성
│   ├── contract.ts     # 컨트랙트 인터페이스
│   └── types.ts        # 타입 정의
├── react/          # React 전용
│   ├── hooks/
│   │   ├── useZkVoting.ts
│   │   ├── useProposals.ts
│   │   └── useVote.ts
│   ├── components/
│   │   ├── VotingWidget.tsx
│   │   ├── ProposalCard.tsx
│   │   └── ProposalList.tsx
│   └── ZkVotingProvider.tsx
└── contracts/      # 컨트랙트 ABI + 배포 정보
    ├── abis/
    └── deployments/
```

---

## Option 2: Embed Widget (Script 삽입)

### 설치 (1줄)
```html
<script src="https://cdn.zkprivate.vote/widget.js"></script>
```

### 사용 (HTML만)
```html
<!-- 투표 위젯 -->
<div
  data-zkpv-widget="voting"
  data-proposal-id="1"
  data-contract="0x..."
  data-chain="sepolia"
></div>

<!-- 제안 목록 -->
<div
  data-zkpv-widget="proposals"
  data-contract="0x..."
></div>
```

### 사용 (JavaScript)
```javascript
// 위젯 초기화
ZkPrivateVote.init({
  container: '#voting-container',
  contractAddress: '0x...',
  chainId: 11155111,
  theme: 'dark',
  onVote: (result) => console.log('투표 완료:', result),
  onError: (err) => console.error('에러:', err),
});
```

### 커스터마이징
```javascript
ZkPrivateVote.init({
  // 기본 설정
  container: '#voting-container',
  contractAddress: '0x...',

  // 테마
  theme: {
    primaryColor: '#6366f1',
    backgroundColor: '#0f172a',
    textColor: '#e2e8f0',
    borderRadius: '12px',
  },

  // 언어
  locale: 'ko', // ko, en, ja, zh

  // 콜백
  onConnect: (address) => {},
  onVote: (result) => {},
  onReveal: (result) => {},
});
```

---

## 구현 계획 (비개발자 우선)

### Phase 1: Embed Widget (최우선) - 3일
- [ ] iframe 기반 위젯 구현
- [ ] CDN 배포 (Vercel/Cloudflare)
- [ ] 복붙 코드 생성기 페이지

### Phase 2: No-Code 통합 도구 - 3일
- [ ] WordPress 플러그인
- [ ] Webflow 커스텀 코드 가이드
- [ ] Notion Embed 지원

### Phase 3: Core SDK - 1주
- [ ] 핵심 로직 분리 (zkproof, contract)
- [ ] 타입 정의
- [ ] 테스트 작성

### Phase 4: React SDK - 1주
- [ ] Provider 컴포넌트
- [ ] Hooks 구현
- [ ] UI 컴포넌트

### Phase 5: 문서화 - 3일
- [ ] 비개발자용 가이드 (스크린샷 포함)
- [ ] 개발자용 API 문서
- [ ] 예제 프로젝트

---

## 비개발자 통합 옵션 (추가)

### Option 3: 코드 생성기 웹페이지

zkprivate.vote/embed 에서:

1. 컨트랙트 주소 입력
2. 테마 선택 (다크/라이트)
3. 언어 선택
4. **"코드 복사" 버튼 클릭**
5. 자기 사이트에 붙여넣기 끝!

```
┌─────────────────────────────────────┐
│  🎨 ZK Private Vote 위젯 생성기     │
├─────────────────────────────────────┤
│  Contract: [0x...            ]      │
│  Theme:    [● Dark  ○ Light ]      │
│  Language: [한국어 ▼        ]      │
│  Size:     [● Full  ○ Compact]     │
├─────────────────────────────────────┤
│  Preview:                           │
│  ┌─────────────────────────────┐   │
│  │  🗳️ 제안 #1               │   │
│  │  [찬성] [반대]              │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  📋 Copy Code                       │
│  ┌─────────────────────────────┐   │
│  │ <script src="..."></script> │   │
│  │ <div data-zkpv...></div>    │   │
│  └─────────────────────────────┘   │
│        [ 코드 복사 ]               │
└─────────────────────────────────────┘
```

### Option 4: 플랫폼별 플러그인

| 플랫폼 | 설치 방법 | 난이도 |
|--------|----------|--------|
| **WordPress** | 플러그인 설치 → 설정 → 숏코드 | ⭐ |
| **Webflow** | 커스텀 코드에 붙여넣기 | ⭐⭐ |
| **Notion** | Embed 블록에 URL 붙여넣기 | ⭐ |
| **Framer** | 컴포넌트 추가 | ⭐⭐ |
| **Squarespace** | 코드 블록에 붙여넣기 | ⭐⭐ |

### Option 5: 독립 투표 페이지 (가장 쉬움)

**자체 사이트 필요 없음!**

```
zkprivate.vote/v/[your-contract-address]
```

- 링크 공유만 하면 끝
- 커스텀 도메인 연결 가능 (vote.yourdao.xyz)
- 로고/색상 커스터마이징

예시:
```
zkprivate.vote/v/0x1234...
→ vote.yourdao.xyz (CNAME 연결)
```

---

## 파일 구조 (모노레포)

```
packages/
├── core/                 # 핵심 로직
│   ├── src/
│   │   ├── zkproof.ts
│   │   ├── contract.ts
│   │   ├── types.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── react/                # React SDK
│   ├── src/
│   │   ├── hooks/
│   │   ├── components/
│   │   ├── ZkVotingProvider.tsx
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── widget/               # Embed Widget
│   ├── src/
│   │   ├── widget.ts
│   │   └── iframe.html
│   ├── package.json
│   └── vite.config.ts
│
└── demo/                 # 예제 앱
    ├── src/
    └── package.json
```

---

## 결정 사항

- **우선순위**: Widget 먼저 → NPM SDK
- **타겟 사용자**: 비개발자 포함 모두
- **브랜딩**: TBD
- **배포 전략**: TBD
- **라이선스**: TBD

---

## 예상 결과물

### 개발자 경험
```bash
# 5분 안에 투표 기능 추가
npm install @zkprivate/voting-sdk
```

```tsx
// 10줄 코드로 완성
import { ZkVotingProvider, VotingWidget } from '@zkprivate/voting-sdk/react';

function MyApp() {
  return (
    <ZkVotingProvider contractAddress="0x...">
      <VotingWidget proposalId={1} />
    </ZkVotingProvider>
  );
}
```

### 비개발자 경험
```html
<!-- 2줄 복붙으로 완성 -->
<script src="https://cdn.zkprivate.vote/widget.js"></script>
<div data-zkpv-widget="voting" data-proposal-id="1"></div>
```
