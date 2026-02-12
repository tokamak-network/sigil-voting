# ZK Private Voting - Design Requirements
# ZK 프라이빗 투표 - 디자인 요구사항

---

## 1. Proposal List Page / 제안 목록 페이지

### 1.1 Header Section / 헤더 섹션

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Page Title | "제안 목록" (Proposal List) | 페이지 제목 | "제안 목록" |
| Create Button | "+ 새 제안" (New Proposal) - Disabled if < 100 TON | 생성 버튼 | "+ 새 제안" - 100 TON 미만 시 비활성화 |
| Balance Bar | TON balance + "최대 N표 가능" (Max N votes possible) | 잔액 바 | TON 잔액 + "최대 N표 가능" |
| Faucet Link | "TON 받기 →" (Get TON) - Only shown when balance is 0 | Faucet 링크 | "TON 받기 →" - 잔액 0일 때만 표시 |

### 1.2 Filter & Search / 필터 및 검색

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Filter Tabs | All / Voting / Reveal / Ended + count for each | 필터 탭 | 전체 / 투표 중 / 공개 중 / 종료 + 각 개수 |
| Search Input | "제안 검색..." (Search proposals...) | 검색 입력 | "제안 검색..." |

### 1.3 Proposal Card / 제안 카드

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Phase Badge | "투표 중" (blue) / "공개 중" (amber) / "종료" (gray) | 상태 배지 | "투표 중" (파랑) / "공개 중" (주황) / "종료" (회색) |
| Voted Badge | "✓ 참여완료" - Only shown if user voted | 투표 배지 | "✓ 참여완료" - 사용자가 투표한 경우만 표시 |
| Title | Proposal title (text) | 제목 | 제안 제목 (텍스트) |
| Participants | "N명 참여" (N participants) | 참여자 수 | "N명 참여" |
| Time Remaining | "N일 N시간 남음" / "N분 N초 남음" (countdown) | 남은 시간 | "N일 N시간 남음" / "N분 N초 남음" (카운트다운) |
| Result (Ended) | "결과: 찬성/반대/동률" (For/Against/Tie) | 결과 (종료시) | "결과: 찬성/반대/동률" |

### 1.4 Empty States / 빈 상태

| State | Message | 상태 | 메시지 |
|-------|---------|------|--------|
| Not Connected | "지갑을 연결하고 투표에 참여하세요" | 미연결 | "지갑을 연결하고 투표에 참여하세요" |
| No Proposals | "아직 제안이 없습니다" + "첫 번째 제안을 만들어보세요" | 제안 없음 | "아직 제안이 없습니다" + "첫 번째 제안을 만들어보세요" |
| No Filter Results | "해당하는 제안이 없습니다" / "검색 결과가 없습니다" | 필터 결과 없음 | "해당하는 제안이 없습니다" / "검색 결과가 없습니다" |
| Loading | Spinner + "제안 목록 불러오는 중..." | 로딩 | 스피너 + "제안 목록 불러오는 중..." |

---

## 2. Proposal Detail Page / 제안 상세 페이지

### 2.1 Header Section / 헤더 섹션

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Back Button | "← 목록으로" (Back to list) | 뒤로 버튼 | "← 목록으로" |
| Title | Proposal title (large) | 제목 | 제안 제목 (크게) |
| Proposer | "제안자: 0x1234...5678" (truncated address) | 제안자 | "제안자: 0x1234...5678" (축약 주소) |

### 2.2 Phase Indicator / 페이즈 표시

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Phase Label | "투표 진행 중" / "공개 진행 중" / "투표 종료" | 페이즈 라벨 | "투표 진행 중" / "공개 진행 중" / "투표 종료" |
| Countdown | "N일 N시간 N분 N초 남음" (live countdown) | 카운트다운 | "N일 N시간 N분 N초 남음" (실시간 카운트다운) |
| Progress Bar | Visual indicator of time remaining | 진행 바 | 남은 시간 시각적 표시 |

### 2.3 Vote Statistics / 투표 통계

| Field | Commit Phase | Reveal/Ended Phase | 필드 | 투표 단계 | 공개/종료 단계 |
|-------|--------------|-------------------|------|---------|-------------|
| Participants | Visible (N) | Visible (N) | 참여자 | 표시 (N) | 표시 (N) |
| For Votes | Hidden (🔒) | Visible (N) | 찬성 투표 | 숨김 (🔒) | 표시 (N) |
| Against Votes | Hidden (🔒) | Visible (N) | 반대 투표 | 숨김 (🔒) | 표시 (N) |

### 2.4 Voting Interface (Commit Phase Only) / 투표 인터페이스 (투표 단계만)

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Section Label 1 | "1. 투표 방향 선택" | 섹션 라벨 1 | "1. 투표 방향 선택" |
| For Button | "찬성" (with TON icon) | 찬성 버튼 | "찬성" (TON 아이콘 포함) |
| Against Button | "반대" (with TON icon) | 반대 버튼 | "반대" (TON 아이콘 포함) |
| Section Label 2 | "2. 투표 강도" | 섹션 라벨 2 | "2. 투표 강도" |
| Intensity Slider | Range 1 to maxVotes | 강도 슬라이더 | 1 ~ 최대투표수 범위 |
| Votes Display | "N표" | 투표 수 표시 | "N표" |
| Cost Display | TON icon + "N TON" | 비용 표시 | TON 아이콘 + "N TON" |
| Cost Formula | "비용 = N × N = M TON" | 비용 공식 | "비용 = N × N = M TON" |
| High Cost Warning | "잔액의 N%를 사용합니다" (if > 70%) | 고비용 경고 | "잔액의 N%를 사용합니다" (70% 초과시) |
| Submit Button | "투표하기" / "방향을 먼저 선택하세요" | 제출 버튼 | "투표하기" / "방향을 먼저 선택하세요" |
| Privacy Notice | "🔒 내 선택은 비공개로 안전하게 보호됩니다" | 개인정보 안내 | "🔒 내 선택은 비공개로 안전하게 보호됩니다" |

### 2.5 Already Voted State / 투표 완료 상태

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Icon | "✓" checkmark | 아이콘 | "✓" 체크마크 |
| Title | "투표 완료" | 제목 | "투표 완료" |
| My Choice | "내 선택: 찬성/반대" | 내 선택 | "내 선택: 찬성/반대" |
| My Votes | "투표 수: N표" | 내 투표 수 | "투표 수: N표" |
| Used TON | "사용 TON: N TON" | 사용 TON | "사용 TON: N TON" |
| TX Link | "거래 영수증 보기 ↗" | 거래 링크 | "거래 영수증 보기 ↗" |
| Reveal Notice | "공개 기간이 되면 투표를 공개해야 집계에 반영됩니다" | 공개 안내 | "공개 기간이 되면 투표를 공개해야 집계에 반영됩니다" |

### 2.6 Reveal Phase Interface / 공개 단계 인터페이스

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Title | "내 투표 공개" | 제목 | "내 투표 공개" |
| Description | "투표 공개 기간입니다. 제출하세요." | 설명 | "투표 공개 기간입니다. 제출하세요." |
| Reveal Button | "투표 공개하기" | 공개 버튼 | "투표 공개하기" |
| Already Revealed | "이미 공개되었습니다" | 이미 공개됨 | "이미 공개되었습니다" |
| No Vote to Reveal | "공개할 투표가 없습니다" | 공개할 투표 없음 | "공개할 투표가 없습니다" |

### 2.7 Ended Phase Interface / 종료 단계 인터페이스

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Result Title | "최종 결과" | 결과 제목 | "최종 결과" |
| Winner | "찬성 승리" / "반대 승리" / "동률" | 승자 | "찬성 승리" / "반대 승리" / "동률" |
| For Votes | "찬성: N표 (M%)" | 찬성 투표 | "찬성: N표 (M%)" |
| Against Votes | "반대: N표 (M%)" | 반대 투표 | "반대: N표 (M%)" |
| Total Committed | "총 참여: N명" | 총 참여 | "총 참여: N명" |
| Total Revealed | "공개 완료: N명" | 공개 완료 | "공개 완료: N명" |
| Visual Bar | Progress bar showing For vs Against ratio | 시각적 바 | 찬성/반대 비율 표시 진행 바 |

### 2.8 No TON State / TON 없음 상태

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Message | "투표하려면 TON이 필요합니다" | 메시지 | "투표하려면 TON이 필요합니다" |
| Faucet Button | "Faucet에서 TON 받기" (with TON icon) | Faucet 버튼 | "Faucet에서 TON 받기" (TON 아이콘 포함) |

---

## 3. Confirmation Modal / 확인 모달

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Title | "투표 확인" | 제목 | "투표 확인" |
| Choice | "선택: 찬성/반대" | 선택 | "선택: 찬성/반대" |
| Votes | "투표 수: N표" | 투표 수 | "투표 수: N표" |
| Cost | "사용 TON: N TON" | 비용 | "사용 TON: N TON" |
| Warning Icon | "⚠️" | 경고 아이콘 | "⚠️" |
| Warning Title | "최종 결정입니다" | 경고 제목 | "최종 결정입니다" |
| Warning Text | "제안당 1번만 투표할 수 있습니다. 이 결정은 나중에 변경하거나 취소할 수 없습니다." | 경고 문구 | "제안당 1번만 투표할 수 있습니다. 이 결정은 나중에 변경하거나 취소할 수 없습니다." |
| Cancel Button | "취소" | 취소 버튼 | "취소" |
| Confirm Button | "확인 및 서명" | 확인 버튼 | "확인 및 서명" |

---

## 4. Success View / 성공 화면

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Animation | Confetti particles | 애니메이션 | 색종이 파티클 |
| Icon | TON logo | 아이콘 | TON 로고 |
| Title | "투표 완료!" | 제목 | "투표 완료!" |
| Subtitle | "투표가 안전하게 제출되었습니다" | 부제목 | "투표가 안전하게 제출되었습니다" |
| Proposal | "제안: [제목]" | 제안 | "제안: [제목]" |
| My Choice | "내 선택: 찬성/반대" | 내 선택 | "내 선택: 찬성/반대" |
| Votes | "투표 수: N표" | 투표 수 | "투표 수: N표" |
| Used TON | "사용 TON: N TON" | 사용 TON | "사용 TON: N TON" |
| TX Link | "거래 영수증 보기 ↗" | 거래 링크 | "거래 영수증 보기 ↗" |
| Reveal Hint | "공개 기간이 시작되면 내 투표를 공개해야 집계에 반영됩니다" | 공개 힌트 | "공개 기간이 시작되면 내 투표를 공개해야 집계에 반영됩니다" |
| Back Button | "목록으로 돌아가기" | 뒤로 버튼 | "목록으로 돌아가기" |

---

## 5. Loading Overlay / 로딩 오버레이

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Spinner | Large animated spinner | 스피너 | 큰 애니메이션 스피너 |
| Progress Text | Dynamic messages (see below) | 진행 텍스트 | 동적 메시지 (아래 참조) |
| Progress Bar | Visual percentage indicator | 진행 바 | 시각적 퍼센트 표시 |

### Progress Messages / 진행 메시지

| Stage | Message | 단계 | 메시지 |
|-------|---------|------|--------|
| Initial | "잠시만 기다려주세요..." | 초기 | "잠시만 기다려주세요..." |
| Preparing | "투표 준비 중..." | 준비 | "투표 준비 중..." |
| Signing | "지갑에서 승인해주세요" | 서명 | "지갑에서 승인해주세요" |

---

## 6. Create Proposal Page / 제안 생성 페이지

| Field | Description | 필드 | 설명 |
|-------|-------------|------|------|
| Back Button | "← 목록으로" | 뒤로 버튼 | "← 목록으로" |
| Title | "새 제안" | 제목 | "새 제안" |
| Subtitle | "커뮤니티에 의견을 물어보세요" | 부제목 | "커뮤니티에 의견을 물어보세요" |
| Input Placeholder | "제안 제목을 입력하세요" | 입력 플레이스홀더 | "제안 제목을 입력하세요" |
| Submit Button | "제안 생성" / "처리 중..." | 제출 버튼 | "제안 생성" / "처리 중..." |
| Status Message | "준비 중..." / "제안 생성 중..." / "거의 완료..." | 상태 메시지 | "준비 중..." / "제안 생성 중..." / "거의 완료..." |

---

## 7. Design System Notes / 디자인 시스템 참고

### Colors / 색상
- **Primary (Blue)**: #0052FF - Actions, links, active states / 액션, 링크, 활성 상태
- **Black**: #000000 - Text, borders / 텍스트, 테두리
- **White**: #FFFFFF - Backgrounds / 배경
- **For (Green)**: #166534 - 찬성 투표 표시
- **Against (Amber)**: #92400e - 반대 투표 표시
- **Ended (Gray)**: #475569 - 종료 상태

### Fonts / 폰트
- **Display**: Space Grotesk - Headings / 제목
- **Body**: Inter - Body text / 본문

### Spacing / 간격
- Borders: 2px solid black / 테두리: 2px 검정 실선
- Shadows: 8px 8px 0px 0px black / 그림자: 8px 8px 0px 0px 검정

### Interactive States / 인터랙티브 상태
- Hover: Shift shadow, color change / 호버: 그림자 이동, 색상 변경
- Disabled: Reduced opacity, no pointer / 비활성화: 투명도 감소, 포인터 없음
- Active: Filled state, blue accent / 활성: 채워진 상태, 파랑 강조

---

## 8. Icons Used / 사용 아이콘

| Icon | Usage | 아이콘 | 용도 |
|------|-------|--------|------|
| TON Symbol | Balance, costs, voting / 잔액, 비용, 투표 | TON 심볼 | 잔액, 비용, 투표 |
| Checkmark (✓) | Completed states / 완료 상태 | 체크마크 (✓) | 완료 상태 |
| Lock (🔒) | Hidden/private data / 숨김/비공개 데이터 | 자물쇠 (🔒) | 숨김/비공개 데이터 |
| Warning (⚠️) | Critical notices / 중요 안내 | 경고 (⚠️) | 중요 안내 |
| Arrow (→) | Navigation, links / 내비게이션, 링크 | 화살표 (→) | 내비게이션, 링크 |
| Arrow (↗) | External links / 외부 링크 | 화살표 (↗) | 외부 링크 |
| Arrow (←) | Back navigation / 뒤로 이동 | 화살표 (←) | 뒤로 이동 |

---

## 9. Component Hierarchy / 컴포넌트 계층

```
ProposalListPage/
├── BalanceBar
├── ListHeader
│   ├── Title
│   └── CreateButton
├── FilterBar
│   ├── FilterTabs
│   └── SearchInput
├── ProposalGrid
│   └── ProposalCard (×N)
│       ├── PhaseBadge
│       ├── VotedBadge
│       ├── Title
│       └── Footer (Participants + Time/Result)
└── EmptyState

ProposalDetailPage/
├── BackButton
├── ProposalCard
│   ├── Title
│   ├── PhaseIndicator
│   ├── VoteStats
│   ├── ProposerInfo
│   └── PhaseContent
│       ├── VotingInterface (Commit)
│       ├── RevealInterface (Reveal)
│       └── ResultInterface (Ended)
├── LoadingOverlay
└── ConfirmModal

SuccessPage/
├── ConfettiAnimation
├── SuccessCard
│   ├── Icon
│   ├── Title
│   ├── VoteSummary
│   └── TxLink
└── BackButton
```
