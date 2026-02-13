# Plan: Service Launch & Marketing

> **Feature**: service-launch-marketing
> **Phase**: Plan
> **Created**: 2026-02-13
> **Status**: DRAFT
> **Priority**: HIGH (회사 다음 미션)

---

## 0. 현재 상태 (AS-IS)

### 0.1 완성된 것
| 항목 | 상태 | 비고 |
|------|:----:|------|
| D1 Private Voting | ✅ | Commit-Reveal-Result 전체 구현 |
| D2 Quadratic Voting | ✅ | 이차투표 비용 계산 + ZK 증명 |
| 스마트 컨트랙트 배포 | ✅ | Sepolia 테스트넷 |
| 프론트엔드 빌드 | ✅ | React 19 + Vite 7, dist 빌드 완료 |
| 랜딩페이지 | ✅ | "Your Vote. Your Secret." 히어로 + 기능 소개 |
| 지갑 연동 | ✅ | MetaMask + WalletConnect |
| GitHub Actions CI | ✅ | Forge 테스트 자동화 |

### 0.2 서비스 오픈에 부족한 것
| 항목 | 상태 | 심각도 |
|------|:----:|:------:|
| 프론트엔드 호스팅 | ❌ | **Critical** |
| 커스텀 도메인 | ❌ | **Critical** |
| OG 메타태그 (SNS 공유) | ❌ | **High** |
| SEO 기본 설정 | ❌ | **High** |
| 유저 가이드 / FAQ | ❌ | **High** |
| 웹 분석 (GA/Mixpanel) | ❌ | **Medium** |
| 에러 모니터링 | ❌ | **Medium** |
| 홍보 자산 (텍스트/이미지) | ❌ | **High** |
| `.env` 개인키 노출 | ⚠️ | **Critical** |

---

## 1. Overview

ZK Private Voting 서비스를 **외부 사용자가 접근 가능한 상태**로 배포하고, **SNS/커뮤니티를 통해 홍보**하여 테스트넷 사용자를 확보한다.

### 1.1 목표
- **서비스 오픈**: 누구나 URL로 접속하여 투표 체험 가능
- **홍보 준비**: SNS 공유 시 프리뷰 카드 표시, 홍보 텍스트 준비
- **사용자 온보딩**: 비기술자도 투표할 수 있는 가이드 제공

### 1.2 타겟 사용자
| 타겟 | 특징 | 접근 경로 |
|------|------|----------|
| 블록체인 개발자 | ZK 기술에 관심, 코드 이해 가능 | GitHub, 기술 블로그 |
| DAO 거버넌스 참여자 | 투표 시스템에 관심, DApp 사용 경험 있음 | 트위터, 디스코드 |
| Tokamak Network 커뮤니티 | TON 토큰 보유, 프로젝트 관심 | 공식 채널 |
| 일반 크립토 유저 | DApp 경험 있으나 ZK 모름 | 트위터, 미디엄 |

---

## 2. 작업 항목

### Phase 1: 배포 인프라 (서비스 오픈 필수)

#### 2.1 Vercel 배포 설정
**목적**: 프론트엔드를 공개 URL로 서비스

**작업 내용**:
- `vercel.json` 생성 (SPA fallback, 헤더 설정)
- Vite 빌드 설정 확인 (`vite.config.ts` base path)
- 환경변수 Vercel 대시보드로 이관
- `public/circuits/` 대용량 파일 서빙 확인 (WASM + zkey)
- CORS 및 CSP 헤더 설정

**주의사항**:
- `dist/` 폴더 내 circuit 파일이 ~29MB → Vercel 무료 플랜 제한 확인
- WASM 파일 MIME type 설정 필요
- Web Worker 동작 확인 (ZK 증명 생성)

**산출물**: `vercel.json`, 배포 URL

#### 2.2 커스텀 도메인 연결
**목적**: 기억하기 쉬운 URL 제공

**작업 내용**:
- 도메인 확보 (회사 결정 필요)
- Vercel DNS 설정
- SSL 인증서 (Vercel 자동)

**의존성**: 도메인명 회사 확정 필요

#### 2.3 보안 정리
**목적**: 개인키 노출 제거

**작업 내용**:
- `.env` 파일에서 PRIVATE_KEY 제거
- `.gitignore`에 `.env` 확인
- 배포용 환경변수는 Vercel Secrets로 이관
- `.env.example` 생성 (값 없이 키만)

---

### Phase 2: SEO & OG 메타태그 (홍보 필수)

#### 2.4 OG 메타태그 추가
**목적**: 트위터/디스코드/텔레그램 공유 시 미리보기 카드 표시

**작업 내용** (`index.html` 수정):
```html
<!-- 기본 메타 -->
<meta name="description" content="No one sees your choice. No one can force you. Math guarantees it.">
<meta name="keywords" content="ZK voting, zero knowledge, private voting, quadratic voting, governance, DAO">

<!-- Open Graph (Facebook, Discord, Telegram) -->
<meta property="og:title" content="ZK-VOTING | Your Vote. Your Secret.">
<meta property="og:description" content="Zero-Knowledge Private Voting with Quadratic Fairness. No one sees your choice.">
<meta property="og:image" content="/og-image.png">
<meta property="og:url" content="https://{domain}">
<meta property="og:type" content="website">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="ZK-VOTING | Your Vote. Your Secret.">
<meta name="twitter:description" content="Zero-Knowledge Private Voting with Quadratic Fairness.">
<meta name="twitter:image" content="/og-image.png">
```

**필요 자산**:
- `og-image.png` (1200x630px) - 프로젝트 대표 이미지
- `favicon.ico` + `apple-touch-icon.png` (현재 vite.svg 사용 중)

#### 2.5 SEO 기본 설정
**목적**: 검색 엔진 노출

**작업 내용**:
- `robots.txt` 생성
- `sitemap.xml` 생성 (단일 페이지이므로 간단)
- 구조화된 데이터 (JSON-LD) 추가
- `<html lang="en">` 확인 ✅ (이미 설정됨)
- canonical URL 설정

---

### Phase 3: 사용자 경험 개선

#### 2.6 유저 가이드 페이지
**목적**: 비기술자도 투표 가능하도록 안내

**구현 방식**: 랜딩페이지 내 "How to Vote" 섹션 추가 또는 별도 페이지

**가이드 내용**:
```
Step 1: 지갑 연결하기
  - MetaMask 설치 → Sepolia 네트워크 전환 → 연결

Step 2: 테스트 TON 받기
  - Sepolia ETH Faucet → TON Faucet 또는 관리자 배포

Step 3: 제안에 투표하기
  - 제안 선택 → 찬성/반대 → 투표 강도 → ZK 증명 생성 → 제출

Step 4: 투표 공개하기
  - Reveal 기간 시작 → "공개" 버튼 클릭

Step 5: 결과 확인하기
  - 투표 종료 후 결과 바 확인
```

**주의**: 테스트넷이므로 "Sepolia Faucet에서 ETH 받기" 설명 필수

#### 2.7 에러 모니터링 (선택)
**목적**: 사용자 에러 추적

**작업 내용**:
- Sentry 또는 LogRocket 연동 (무료 플랜)
- ZK 증명 실패, 트랜잭션 실패 등 크리티컬 에러 추적
- 에러 발생 시 사용자 친화적 메시지

#### 2.8 웹 분석 설정
**목적**: 유입 경로, 사용 패턴 추적

**작업 내용**:
- Google Analytics 4 또는 Plausible (프라이버시 중시 → 프로젝트 성격에 맞음)
- 주요 이벤트 트래킹:
  - 지갑 연결
  - 투표 제출 (Commit)
  - 투표 공개 (Reveal)
  - 결과 조회

---

### Phase 4: 홍보 자산 준비

#### 2.9 홍보 텍스트 작성
**목적**: SNS/커뮤니티 발표용 콘텐츠

**산출물**:

##### 트위터 발표문 (영문)
```
Introducing ZK-VOTING: Private Voting with Zero-Knowledge Proofs

Your vote, your secret. No one can see your choice or force you to reveal it.

Features:
- D1 Private Voting: True ballot secrecy with commit-reveal
- D2 Quadratic Voting: Fair influence — cost = votes squared
- ZK Proofs: Cryptographic privacy, not trust

Try it on Sepolia Testnet: [URL]
Built on Tokamak Network

#ZKP #Governance #DAO #Privacy #QuadraticVoting
```

##### 한국어 발표문
```
ZK-VOTING 테스트넷 오픈

투표는 비밀이어야 합니다.
누구도 당신의 선택을 볼 수 없고, 강요할 수 없습니다.
수학이 보장합니다.

주요 기능:
- 비밀 투표: 영지식 증명으로 투표 내용 암호화
- 이차 투표: 공정한 영향력 배분 (비용 = 투표수²)
- 위변조 불가: 온체인 검증, 중복 투표 방지

지금 Sepolia 테스트넷에서 체험: [URL]

#영지식증명 #거버넌스 #DAO #ZKVoting
```

##### 디스코드/텔레그램 발표문
```
[공지] ZK-VOTING 테스트넷 오픈

프라이버시를 보장하는 온체인 투표 시스템을 공개합니다.

What makes it different:
1. Your vote is encrypted — no one can see your choice until reveal
2. Quadratic voting — prevents whale domination
3. Zero-knowledge proofs — privacy verified by math, not trust
4. Built on Tokamak Network with TON token

How to try:
1. Visit [URL]
2. Connect MetaMask (Sepolia network)
3. Get test TON tokens
4. Create or vote on proposals

Feedback and bug reports welcome!
```

#### 2.10 OG 이미지 제작
**목적**: SNS 공유 시 시각적 임팩트

**사양**:
- 크기: 1200 x 630px
- 내용: 프로젝트 로고 + "Your Vote. Your Secret." + ZK 관련 그래픽
- 배경: brutalist 디자인 톤 (현재 UI와 일관)
- 형식: PNG (압축)

**제작 방법**:
- Figma/Canva로 제작 또는
- HTML → Screenshot 방식 (코드로 생성 가능)

#### 2.11 파비콘 & 앱 아이콘 업데이트
**목적**: 브라우저 탭 + 북마크 아이콘

**작업 내용**:
- `favicon.ico` (32x32, 16x16)
- `apple-touch-icon.png` (180x180)
- `favicon-32x32.png`, `favicon-16x16.png`
- 현재 `vite.svg` → 프로젝트 전용 아이콘으로 교체

---

## 3. 구현 순서 & 우선순위

```
Phase 1 (배포) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ┃
  ┣━ [P0] 2.3 보안 정리 (.env 개인키 제거)
  ┣━ [P0] 2.1 Vercel 배포 설정
  ┗━ [P1] 2.2 커스텀 도메인 (회사 확정 대기)

Phase 2 (SEO/OG) ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ┃
  ┣━ [P0] 2.4 OG 메타태그 추가
  ┗━ [P1] 2.5 SEO 기본 설정

Phase 3 (사용자 경험) ━━━━━━━━━━━━━━━━━━━━━━━
  ┃
  ┣━ [P1] 2.6 유저 가이드
  ┣━ [P2] 2.7 에러 모니터링
  ┗━ [P2] 2.8 웹 분석

Phase 4 (홍보) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ┃
  ┣━ [P0] 2.9 홍보 텍스트 작성
  ┣━ [P1] 2.10 OG 이미지 제작
  ┗━ [P1] 2.11 파비콘 업데이트
```

**우선순위 범례**: P0 = 서비스 오픈 차단, P1 = 홍보 품질, P2 = 나이스투해브

---

## 4. 기술 상세

### 4.1 Vercel 배포 설정

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/circuits/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" },
        { "key": "Content-Type", "value": "application/wasm" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

**대용량 파일 주의사항**:
- `public/circuits/` 내 WASM + zkey 파일 (~29MB)
- Vercel 무료 플랜: 단일 파일 50MB 제한 → OK
- Edge 캐싱으로 반복 다운로드 최적화
- 초기 로딩 시간 사용자 안내 필요

### 4.2 환경변수 구조

```bash
# .env.example (커밋 가능)
VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_CHAIN_ID=11155111

# Vercel Secrets (대시보드에서 설정)
PRIVATE_KEY=<deploy-only, 프론트엔드 불필요>
ETHERSCAN_API_KEY=<optional>
```

**핵심**: 프론트엔드는 RPC URL만 필요. PRIVATE_KEY는 배포 스크립트 전용.

### 4.3 Analytics 이벤트 설계

```typescript
// 주요 추적 이벤트
analytics.track('wallet_connected', { provider: 'metamask' | 'walletconnect' })
analytics.track('proposal_created', { proposalId })
analytics.track('vote_committed', { proposalId, numVotes })
analytics.track('vote_revealed', { proposalId })
analytics.track('result_viewed', { proposalId })
analytics.track('guide_opened')
```

---

## 5. 파일 변경 예상

| 파일 | 변경 내용 | 위험도 |
|------|----------|:------:|
| `index.html` | OG 메타태그, 파비콘 추가 | 낮음 |
| `vercel.json` | 신규 생성 | 낮음 |
| `public/robots.txt` | 신규 생성 | 낮음 |
| `public/og-image.png` | 신규 생성 (이미지) | 낮음 |
| `public/favicon.ico` | 교체 | 낮음 |
| `.env` | 개인키 제거 | 낮음 |
| `.env.example` | 신규 생성 | 낮음 |
| `src/components/LandingPage.tsx` | 가이드 섹션 추가 (선택) | 중 |
| `src/App.tsx` | Analytics 초기화 (선택) | 낮음 |
| `vite.config.ts` | 변경 없음 | - |
| `contracts/*` | 변경 없음 | - |
| `circuits/*` | 변경 없음 | - |

---

## 6. 의존성 & 결정 필요 사항

### 6.1 회사 결정 필요
| 항목 | 결정 내용 | 담당 |
|------|----------|------|
| 도메인 | `zkvoting.tokamak.network` 등 | 회사 |
| OG 이미지 | 디자이너 제작 vs 코드 생성 | 회사/팀 |
| 파비콘 | Tokamak 브랜드 가이드 확인 | 디자인 |
| 분석 도구 | GA4 vs Plausible vs Mixpanel | 팀 |
| 홍보 채널 | 트위터, 디스코드, 미디엄, 텔레그램 | 마케팅 |
| 홍보 시점 | 배포 즉시 vs 내부 테스트 후 | 팀 |
| 테스트 TON 배포 | Faucet 구축 vs 수동 배포 vs 안내 | 팀 |

### 6.2 개발자 즉시 진행 가능
| 항목 | 예상 시간 |
|------|----------|
| `.env` 보안 정리 | 10분 |
| `vercel.json` 생성 | 15분 |
| OG 메타태그 추가 | 20분 |
| `robots.txt` + SEO | 15분 |
| 홍보 텍스트 작성 | 30분 |
| 유저 가이드 섹션 | 1~2시간 |
| Analytics 연동 | 30분~1시간 |

---

## 7. 성공 기준

### 7.1 서비스 오픈 기준
| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| URL 접속 | 공개 URL에서 랜딩페이지 표시 | 브라우저 접속 |
| 지갑 연결 | MetaMask 연결 성공 | 실제 테스트 |
| 투표 기능 | Commit → Reveal → Result 전체 플로우 | E2E 테스트 |
| HTTPS | SSL 인증서 유효 | 브라우저 확인 |
| 모바일 | 모바일 브라우저에서 정상 표시 | 실기기 테스트 |

### 7.2 홍보 준비 기준
| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| OG 카드 | 트위터/디스코드 공유 시 미리보기 표시 | 실제 공유 |
| 홍보문 | 영/한 발표문 준비 | 문서 확인 |
| 가이드 | 비기술자 테스트 통과 | 사내 테스트 |

### 7.3 운영 기준
| 항목 | 기준 | 검증 방법 |
|------|------|----------|
| 에러율 | 크리티컬 에러 0건/일 | 모니터링 |
| 응답 시간 | 페이지 로드 < 3초 | Lighthouse |
| 가용성 | 99%+ 업타임 | Vercel 대시보드 |

---

## 8. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Circuit 파일 대용량 (29MB) | 초기 로딩 느림 | 로딩 인디케이터 + CDN 캐싱 |
| Sepolia RPC 불안정 | 투표 실패 | 폴백 RPC 설정 (Alchemy, Infura) |
| 테스트넷 TON 부족 | 사용자 투표 불가 | Faucet 또는 배포 방법 안내 |
| ZK 증명 생성 느림 | 사용자 이탈 | 이미 FingerprintLoader 있음 ✅ |
| 개인키 git 이력 노출 | 보안 위험 | git history 정리 또는 키 교체 |

---

## 9. 타임라인 (제안)

```
Week 1: 배포 + 보안
  ├─ Day 1-2: 보안 정리 + Vercel 배포 + 동작 확인
  └─ Day 3: 내부 테스트 (전체 투표 플로우)

Week 2: 홍보 준비
  ├─ Day 1: OG 메타태그 + SEO + 파비콘
  ├─ Day 2: 유저 가이드 페이지
  ├─ Day 3: 홍보 텍스트 최종 확정
  └─ Day 4-5: 내부 리뷰 + 수정

Week 3: 오픈
  ├─ Day 1: 도메인 연결 + 최종 확인
  ├─ Day 2: SNS 발표 (트위터, 디스코드)
  └─ Day 3-5: 피드백 수집 + 버그 수정
```

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-02-13 | AI | 초기 Plan 생성 - 서비스 오픈 + 홍보 마케팅 |
