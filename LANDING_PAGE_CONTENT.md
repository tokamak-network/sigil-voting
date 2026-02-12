# ZK Private Voting - Landing Page Content for Stitch

> 작성일: 2026-02-11
> 용도: Google Stitch 디자인 요청용 콘텐츠

---

## 국문 (Korean)

### Hero
- 배지: "Powered by Zero-Knowledge Proofs"
- 제목: "당신의 투표. 당신만의 비밀."
- 부제: "아무도 볼 수 없고, 강요할 수도 없습니다. 수학이 보장합니다."
- CTA: "투표 참여하기", "GitHub"

### 일반 투표의 문제점
1. 👁️ 투표 내용 노출 - 블록체인에 모든 투표가 공개됨
2. 🐋 고래의 지배 - 1토큰=1표라서 부자가 전부 결정
3. 😰 압박과 강요 - 투표 내용이 보여서 협박 가능

### 당신이 얻는 것

#### 🔐 완전한 비밀
결과 공개 전까지 투표 내용이 숨겨집니다.
시스템조차 당신의 선택을 모릅니다.

#### 🛡️ 강요 불가
누구에게도 투표 내용을 증명할 수 없습니다.
외부 압력 없이 자유롭게 투표하세요.

#### ⚖️ 공정한 영향력
돈이 많으면 더 투표할 수 있습니다.
하지만 비용이 제곱으로 증가해서 지배는 못 합니다.

#### ✅ 수학으로 검증
모든 투표가 온체인에서 암호학적으로 검증됩니다.
신뢰가 필요 없습니다. 수학만 있으면 됩니다.

### 이렇게 작동합니다
1. **투표** - 찬성/반대 선택, 강도 조절, 제출
2. **대기** - 투표 기간 동안 선택이 암호화된 상태로 유지
3. **공개** - 투표가 공개되고 자동으로 집계

### Quadratic Voting: 왜 공정한가

#### 일반 투표 (1 TON = 1표)
| 보유량 | 투표수 | 영향력 |
|--------|--------|--------|
| 100 TON | 100표 | 1x |
| 10,000 TON | 10,000표 | 100x |

→ 부자가 100배 더 강함 😰

#### Quadratic Voting (비용 = 투표수²)
| 보유량 | 최대 투표수 | 영향력 |
|--------|------------|--------|
| 100 TON | 10표 | 1x |
| 10,000 TON | 100표 | 10x |

→ 부자가 10배만 더 강함 ✅

**핵심: 돈으로 영향력을 살 수 있지만, 가격이 급격히 비싸짐**

### 경쟁 서비스 비교
| 기능 | ZK 비밀 투표 | Snapshot | Tally |
|------|-------------|----------|-------|
| 투표 비밀 | ✅ 암호화 | ❌ 공개 | ✅ |
| 강요 방지 | ✅ 증명 불가 | ❌ | ❌ |
| 온체인 검증 | ✅ | ❌ | ❌ |
| 고래 방지 | ✅ Quadratic | ❌ | ❌ |

### 왜 신뢰할 수 있나요?
- **오픈소스** - 누구나 코드를 검증할 수 있습니다
- **온체인 검증** - 스마트 컨트랙트가 모든 증명을 확인
- **설정 불필요** - 지갑 연결하면 바로 투표
- **검증된 암호학** - Groth16 증명 시스템 사용

### 진행 중인 제안 (캐러셀)
- 섹션 제목: "N개의 제안이 진행 중"
- 부제: "드래그하거나 스크롤해서 제안을 둘러보세요"
- 가로 스크롤 캐러셀
- 카드 정보: 제안 번호, 제목, 상태(🗳️투표중/📢공개중/✓종료), 참여자 수
- 클릭하면 해당 제안으로 이동
- 정렬: 활성 제안 우선 (투표중 > 공개중 > 종료)

### 기술 스택
- ZK 회로: Circom + Groth16
- 스마트 컨트랙트: Solidity
- 토큰: TON
- 네트워크: Sepolia 테스트넷

### CTA
- "Sepolia 테스트넷에서 체험하세요"
- "지갑 연결 → 제안 선택 → 투표"

---

## 영문 (English)

### Hero
- Badge: "Powered by Zero-Knowledge Proofs"
- Title: "Your Vote. Your Secret."
- Subtitle: "No one sees your choice. No one can force you. Math guarantees it."
- CTA: "Start Voting", "GitHub"

### The Problem with Regular Voting
1. 👁️ Exposed Votes - All votes visible on blockchain
2. 🐋 Whale Dominance - 1 token = 1 vote means rich decide everything
3. 😰 Coercion Risk - Visible votes enable pressure and threats

### What You Get

#### 🔐 True Privacy
Your vote stays hidden until results are revealed.
Not even the system knows what you chose.

#### 🛡️ No Coercion
You cannot prove how you voted to anyone.
Vote freely without fear of pressure.

#### ⚖️ Fair Influence
More money means more votes.
But quadratic cost prevents domination.

#### ✅ Verified by Math
Every vote is cryptographically verified on-chain.
No trust required. Just math.

### How It Works
1. **Vote** - Choose For/Against, select intensity, submit
2. **Wait** - Your choice stays encrypted during voting period
3. **Reveal** - Votes are disclosed and automatically counted

### Quadratic Voting: Why It's Fair

#### Regular Voting (1 TON = 1 vote)
| Balance | Votes | Influence |
|---------|-------|-----------|
| 100 TON | 100 votes | 1x |
| 10,000 TON | 10,000 votes | 100x |

→ Rich are 100x stronger 😰

#### Quadratic Voting (Cost = Votes²)
| Balance | Max Votes | Influence |
|---------|-----------|-----------|
| 100 TON | 10 votes | 1x |
| 10,000 TON | 100 votes | 10x |

→ Rich are only 10x stronger ✅

**Key: You can buy influence, but it gets exponentially expensive**

### Comparison
| Feature | ZK Private Voting | Snapshot | Tally |
|---------|-------------------|----------|-------|
| Vote Privacy | ✅ Encrypted | ❌ Public | ✅ |
| Anti-Coercion | ✅ Unprovable | ❌ | ❌ |
| On-chain Proof | ✅ | ❌ | ❌ |
| Whale Protection | ✅ Quadratic | ❌ | ❌ |

### Why Trust This?
- **Open Source** - Anyone can audit the code
- **On-chain Verification** - Smart contract verifies all proofs
- **Zero Setup** - Just connect wallet and vote
- **Battle-tested Crypto** - Groth16 proof system

### Live Proposals (Carousel)
- Section Title: "N Proposals in Progress"
- Subtitle: "Drag or scroll to browse proposals"
- Horizontal scrollable carousel
- Card info: Proposal number, Title, Status (🗳️Voting/📢Reveal/✓Ended), Participants
- Click card to navigate to proposal
- Sort: Active first (Voting > Reveal > Ended)

### Tech Stack
- ZK Circuit: Circom + Groth16
- Smart Contract: Solidity
- Token: TON
- Network: Sepolia Testnet

### CTA
- "Try it on Sepolia Testnet"
- "Connect Wallet → Pick a Proposal → Vote"

---

## Stitch 프롬프트 예시

### 국문
> "ZK 비밀 투표 서비스 랜딩페이지 디자인해줘. 다크 테마에 은은한 그라데이션. 프라이버시와 공정성 강조. 진행중인 제안을 보여주는 가로 카드 캐러셀 포함."

### English
> "Design a modern landing page for ZK Private Voting. Dark theme with subtle gradients. Emphasize privacy and fairness. Include a horizontal card carousel for live proposals."

---

## 오늘 작업 요약

### 완료된 작업
1. ✅ ProposalsCarousel 컴포넌트 생성 (랜딩페이지용)
2. ✅ 카드 클릭 시 해당 제안으로 빠른 네비게이션
3. ✅ 제안 병렬 fetch로 속도 개선
4. ✅ 카드 간격 40px, 섹션 타이틀 가운데 정렬
5. ✅ 커밋 완료: "feat: Add proposals carousel to landing page with fast navigation"

### 다음 작업 (내일)
1. Google Stitch에서 새 디자인 받기
2. Stitch 디자인을 현재 프로젝트에 적용
3. 랜딩페이지 콘텐츠 업데이트 (이 문서 내용 기반)

### 참고 파일
- 캐러셀 컴포넌트: `src/components/ProposalsCarousel.tsx`
- 랜딩페이지: `src/components/LandingPage.tsx`
- 스타일: `src/App.css` (proposal-carousel-* 클래스들)
