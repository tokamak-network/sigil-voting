# Testing Guide

## Overview

zkDEX D1 Private Voting Demo 테스트 가이드입니다.

## Prerequisites

테스트 전 준비사항:

1. **Node.js 18+** 설치
2. **Web3 지갑** (MetaMask 권장)
3. **Sepolia 테스트넷 ETH** (투표 시뮬레이션용)

## Quick Start

### 1. 개발 서버 실행

```bash
# 프로젝트 폴더로 이동
cd zk-dex-d1-private-voting

# 의존성 설치
npm install

# 개발 서버 시작
npm run dev
```

### 2. 브라우저에서 접속

```
http://localhost:5173
```

## Test Scenarios

### Test 1: Landing Page

**목적**: 랜딩 페이지 UI 확인

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 메인 페이지 접속 | Hero 섹션이 표시됨 |
| 2 | 아래로 스크롤 | 모든 섹션이 순서대로 표시됨 |
| 3 | KO/EN 버튼 클릭 | 언어가 전환됨 |

**확인할 섹션**:
- [ ] Hero Section
- [ ] Comparison (Normal vs ZK Voting)
- [ ] Problem Section
- [ ] How It Works (4 Steps)
- [ ] Benefits (6 Cards)
- [ ] Commit-Reveal Mechanism
- [ ] Use Cases (4 Cards)
- [ ] Security Features (3 Cards)
- [ ] FAQ Section
- [ ] CTA Section

### Test 2: Wallet Connection

**목적**: 지갑 연결 기능 테스트

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | "Connect Wallet" 버튼 클릭 | 지갑 선택 모달 표시 |
| 2 | MetaMask 선택 | MetaMask 팝업 열림 |
| 3 | 연결 승인 | 주소가 헤더에 표시됨 |
| 4 | 네트워크 확인 | Sepolia 테스트넷으로 연결됨 |

### Test 3: Proposals List

**목적**: 제안 목록 페이지 테스트

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | "Proposals" 메뉴 클릭 | 제안 목록 페이지로 이동 |
| 2 | 통계 확인 | 총 제안 수, 활성 제안 수 표시 |
| 3 | "All" 탭 클릭 | 모든 제안 표시 |
| 4 | "Active" 탭 클릭 | 활성 제안만 표시 |
| 5 | "Closed" 탭 클릭 | 종료된 제안만 표시 |

### Test 4: Voting Flow (Core Feature)

**목적**: 투표 프로세스 전체 테스트

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 활성 제안 카드 클릭 | 제안 상세 페이지로 이동 |
| 2 | 제안 내용 확인 | 제목, 설명, 상태 표시 |
| 3 | "For" 버튼 클릭 | 선택 표시됨 |
| 4 | ZK Notice 확인 | "Your vote will be sealed" 메시지 |
| 5 | 투표 제출 | MetaMask 팝업 표시 |
| 6 | MetaMask에서 승인 | 트랜잭션 전송 |
| 7 | 완료 확인 | Commitment Hash + Etherscan 링크 표시 |

### Test 5: My Votes

**목적**: 투표 내역 확인

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | "My Votes" 메뉴 클릭 | 내 투표 페이지로 이동 |
| 2 | Voting Power 확인 | 토큰 수량 표시 |
| 3 | 투표 내역 확인 | 방금 한 투표가 목록에 표시됨 |
| 4 | 상세 정보 확인 | 제안 제목, 선택, 커밋먼트 해시 표시 |

### Test 6: Language Toggle

**목적**: 다국어 지원 테스트

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 현재 언어 확인 | KO 또는 EN 표시 |
| 2 | 언어 버튼 클릭 | 다른 언어로 전환 |
| 3 | 모든 텍스트 확인 | UI 텍스트가 전환됨 |
| 4 | 페이지 이동 | 선택한 언어 유지됨 |

### Test 7: Create Proposal

**목적**: 제안 생성 기능 테스트

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | "Create Proposal" 버튼 클릭 | 생성 페이지로 이동 |
| 2 | 제목 입력 | 텍스트 입력됨 |
| 3 | 카테고리 선택 | 드롭다운에서 선택 |
| 4 | 기간 선택 | 투표 기간 설정 |
| 5 | 설명 입력 | 텍스트 영역에 입력 |
| 6 | 제출 | 성공 메시지 또는 목록으로 이동 |

## Mobile Testing

### Responsive Design Check

| Viewport | Width | Test Items |
|----------|-------|------------|
| Mobile | 375px | 메뉴 축소, 카드 1열 |
| Tablet | 768px | 카드 2열 |
| Desktop | 1024px+ | 전체 레이아웃 |

## On-chain Features

실제 블록체인에 기록되는 기능:

| Feature | Behavior |
|---------|----------|
| Commitment Hash | keccak256(choice + salt) 온체인 기록 |
| 투표 기록 | 스마트 컨트랙트에 영구 저장 |
| 트랜잭션 | Etherscan에서 확인 가능 |

## Known Limitations

| Feature | Limitation |
|---------|------------|
| ZK Proof | 실제 ZK 증명 아님 (해시만 사용) |
| 제안 목록 | 일부 샘플 데이터 포함 |

## Troubleshooting

### 문제: 페이지가 로드되지 않음

```bash
# 해결 방법
rm -rf node_modules
npm install
npm run dev
```

### 문제: 지갑이 연결되지 않음

1. MetaMask가 설치되어 있는지 확인
2. Sepolia 테스트넷이 추가되어 있는지 확인
3. 브라우저 새로고침

### 문제: 네트워크 오류

MetaMask에서 Sepolia 네트워크 추가:
- Network Name: Sepolia
- RPC URL: https://sepolia.infura.io/v3/
- Chain ID: 11155111
- Symbol: ETH

## Test Checklist

최종 테스트 체크리스트:

- [ ] 랜딩 페이지 모든 섹션 표시
- [ ] 언어 전환 (KO/EN) 동작
- [ ] 지갑 연결 성공
- [ ] 제안 목록 필터링 동작
- [ ] 투표 프로세스 완료
- [ ] 내 투표 내역 표시
- [ ] 반응형 디자인 확인
- [ ] 에러 없이 콘솔 깨끗함
