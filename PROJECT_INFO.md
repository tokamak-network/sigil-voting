# ZK Private Voting 프로토타입

## 프로젝트 개요

**회사**: Tokamak Network (https://www.tokamak.network/)
**프로젝트**: zkDEX D1 Private Voting 데모
**목적**: Operation Spear Track B 과제 - 2주 내 완결된 성과물

---

## 배경

### Operation Spear (OS)
- 기간: 2026년 2월 1일 ~ 28일 (4주)
- 목표: AI 활용을 통한 산출량 & 속도 극대화
- Track B: 2주마다 1개 이상의 완결된 성과물 추가

### 왜 이 프로젝트를 선택했나

1. CEO Kevin이 공유한 zkDEX 100개 아이디어 문서에서 선택
2. D1 Private Voting이 가장 구현 난이도 낮음 (~150K constraints)
3. DAO 거버넌스에 실제 적용 가능 → 회사 기여도 높음

---

## Tokamak Network 정보

### 회사 개요
- **개발사**: Onther Inc. (한국)
- **운영법인**: Tokamak Network Pte. Ltd. (싱가포르)
- **CEO**: Kevin Jeong (정순형)
- **핵심 제품**: Rollup Hub (L2 배포 플랫폼)

### 주요 인물
| 이름 | 직책 |
|------|------|
| Kevin Jeong (정순형) | CEO & Founder |
| June Sim | Onther CEO |
| Dr. 최공필 | Chief Economist |

### 기술 스택
- Thanos Stack (OP Stack v1.7.7 포크)
- Go 50.2% / Solidity 41.7% / TypeScript 5.6%
- zk-EVM 개발 중

### 토큰 (TON)
- 컨트랙트: 0x2be5e8c109e2197D077D13A82dAead6a9b3433C5
- 총 공급량: ~100M TON (무제한)
- 현재 가격: ~$0.70-0.75
- 스테이킹: ~24M TON

### 현재 방향
- Rollup Hub SDK (B2B, 개발자 대상)
- 유저 대상 서비스(Bridge 등)는 종료됨
- zkDEX 100개 아이디어 개발 중

---

## zkDEX D1 Private Voting

### 핵심 컨셉
```
투표 선택 → ZK proof로 암호화 → 제출
→ 누가 뭘 골랐는지 모름
→ 결과만 공개
```

### 기술 사양

**공개 입력값:**
- voteCommitment (투표 선택의 해시)
- proposalId (제안 ID)
- votingPower (투표권)
- merkleRoot (투표 자격자 스냅샷)

**비공개 입력값:**
- pkX, pkY, sk (투표자 키 쌍)
- voteChoice (선택: 0/1/2)
- voteSalt (랜덤 솔트)
- merkleProof (자격 증명)

### 회로 로직 (6단계)
1. 거버넌스 토큰 검증
2. 스냅샷 포함 확인 (Merkle proof)
3. 소유권 검증
4. 투표권 일치 확인
5. 선택 유효성 (0, 1, 2만)
6. 커밋먼트 생성

### 유즈케이스
- 프로토콜 매개변수 변경 투표
- 재무 보조금 결정
- 논쟁적 결정
- 이사회 선거

### 참고 문서
- 영문: https://github.com/tokamak-network/zk-dex/tree/circom/docs/future
- 한글: https://github.com/tokamak-network/zk-dex/tree/circom/docs/future_ko
- D1 문서: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future_ko/circuit-addons/d-governance/d1-private-voting.md

---

## 프로토타입 구현

### 기술 스택
- React + TypeScript
- Vite
- CSS (커스텀)

### 파일 구조
```
/Users/meeso/MEEE_SO/WORK/05_온더/zk-voting-demo/
├── src/
│   ├── App.tsx      # 메인 컴포넌트
│   ├── App.css      # 스타일
│   └── index.css    # 기본 스타일
├── package.json
└── PROJECT_INFO.md  # 이 파일
```

### 실행 방법
```bash
cd /Users/meeso/MEEE_SO/WORK/05_온더/zk-voting-demo
npm install
npm run dev
```
→ http://localhost:5173/ 에서 확인

### 프로토타입 기능
1. 제안서 카드 표시
2. 투표 선택 (For / Against / Abstain)
3. ZK Proof 생성 애니메이션 (시뮬레이션)
4. 투표 제출 → Commitment 해시 표시
5. 결과 보기 (투표 선택은 비공개)
6. 투표 로그 (Commitment만 표시)

---

## 디자인 수정

### CSS 파일 위치
```
/Users/meeso/MEEE_SO/WORK/05_온더/zk-voting-demo/src/App.css
```

### 주요 클래스
| 클래스 | 설명 |
|--------|------|
| `.app` | 전체 컨테이너 |
| `.header` | 헤더 |
| `.proposal-card` | 제안서 카드 |
| `.vote-options` | 투표 버튼 컨테이너 |
| `.vote-option` | 개별 투표 버튼 |
| `.vote-option.for.selected` | 찬성 선택됨 |
| `.vote-option.against.selected` | 반대 선택됨 |
| `.vote-option.abstain.selected` | 기권 선택됨 |
| `.submit-button` | 제출 버튼 |
| `.generating-section` | ZK 생성 중 화면 |
| `.spinner` | 로딩 스피너 |
| `.progress-bar` | 진행률 바 |
| `.submitted-section` | 제출 완료 화면 |
| `.commitment-box` | Commitment 해시 표시 |
| `.results-section` | 결과 화면 |
| `.result-bar` | 결과 막대 그래프 |
| `.result-fill.for` | 찬성 막대 |
| `.result-fill.against` | 반대 막대 |
| `.result-fill.abstain` | 기권 막대 |
| `.vote-log` | 투표 로그 |
| `.footer` | 푸터 |

### 컬러 팔레트
- 배경: #0a0a0f → #1a1a2e (그라디언트)
- 메인 블루: #2563eb, #60a5fa
- 퍼플: #7c3aed
- 찬성 그린: #22c55e, #4ade80
- 반대 레드: #ef4444, #f87171
- 기권 옐로우: #eab308, #fbbf24

---

## 다음 단계 (선택)

### 프로토타입 확장
1. 실제 Circom 회로 연동
2. 스마트 컨트랙트 배포
3. 지갑 연결 (MetaMask)
4. Thanos Testnet 배포

### 산출물 완성
1. GitHub 레포 정리
2. README 작성
3. Medium 블로그 포스트
4. 데모 영상 녹화

---

## 참고 링크

- Tokamak Network: https://www.tokamak.network/
- Rollup Hub: https://rolluphub.tokamak.network/about
- Docs: https://docs.tokamak.network/home/
- GitHub: https://github.com/tokamak-network
- zkDEX: https://github.com/tokamak-network/zk-dex/tree/circom
- Medium: https://medium.com/tokamak-network
