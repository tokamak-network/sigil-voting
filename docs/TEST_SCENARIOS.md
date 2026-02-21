# Test Scenarios - SIGIL MACI Voting

## 전제 조건
- Sepolia 네트워크
- `src/config.json`의 MACI/Poll/VK 주소가 최신
- 코디네이터 실행 환경 준비
  - `.env`에 `PRIVATE_KEY`, `COORDINATOR_PRIVATE_KEY`, `SEPOLIA_RPC_URL`
  - 충분한 Sepolia ETH + 테스트 토큰

## Scenario 1: 지갑 연결
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 페이지 로드 | Landing 페이지 표시 |
| 2 | Connect Wallet 클릭 | MetaMask 팝업 |
| 3 | 지갑 연결 | 주소 표시 |
| 4 | 네트워크 확인 | Sepolia인지 확인 |

## Scenario 2: 제안 생성
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Proposals 페이지 이동 | 제안 목록 표시 |
| 2 | Create Proposal 클릭 | 폼 표시 |
| 3 | 제목/설명/기간 입력 | 입력값 반영 |
| 4 | Create 클릭 | MACI.deployPoll 호출, 새 Poll 생성 |

## Scenario 3: 투표 (MACI 암호화)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 제안 클릭 | 상세 페이지 |
| 2 | 찬성/반대 선택 | 선택 표시 |
| 3 | 투표 강도 조절 | 비용 = 강도^2 표시 |
| 4 | Submit | 암호화 메시지 publishMessage 호출 |
| 5 | 완료 | 제출 확인 + 로컬 저장 |

## Scenario 4: 재투표 (Key Change)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 투표 후 “Re-vote” 클릭 | 재투표 모드 |
| 2 | 다른 선택/강도 입력 | 입력 반영 |
| 3 | Submit | key change + 새 메시지 제출 |
| 4 | 완료 | 마지막 메시지만 집계 대상 |

## Scenario 5: 집계/결과 (기본)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 투표 종료 후 대기 | Merging/Processing 상태 표시 |
| 2 | 코디네이터 실행 | merge/processing/tally 진행 |
| 3 | tallyVerified=true | Finalized 상태 |
| 4 | 결과 페이지 | For/Against 합산 결과 표시 (기본 화면) |
| 5 | 지갑 미연결 | 종료된 제안 결과 열람 가능 |

## Scenario 6: 투표 없음
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 아무도 투표하지 않음 | NoVotes 상태 |
| 2 | 결과 페이지 | “투표 없음” 메시지 표시 |

## 운영 확인 포인트
- 코디네이터가 중단되면 Finalized로 전환되지 않음
- 결과는 `Tally` 컨트랙트의 `forVotes/againstVotes/totalVoters`를 기준으로 표시됨
