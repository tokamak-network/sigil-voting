# System Architecture

## Overview

SIGIL은 D1(비공개 투표) + D2(이차 투표) + MACI(담합 방지)를 **하나의 투표 시스템**으로 제공한다. 사용자 입장에서는 **찬성/반대 + 투표 강도(비용=강도^2)** 만 보이며, 개별 투표는 영구히 공개되지 않는다. 결과는 **집계 합산치만 온체인 공개**된다.

## System Design

```
User → Encrypt vote (ECDH + DuplexSponge) → Poll.publishMessage()
                                            ↓
                                      AccQueue (on-chain)
                                            ↓
                         Coordinator auto-runner (off-chain)
                         - merge state & message trees
                         - process messages (reverse order)
                         - generate Groth16 proofs
                                            ↓
                        MessageProcessor.verify() → Tally.verify()
                                            ↓
                            Results published on-chain (aggregates only)
```

## MACI Phase Flow

```
Registration → Voting → AccQueue Merge → Processing → Finalized
```

- **Registration**: signUp (자동, 별도 UI 필요 없음)
- **Voting**: 암호화 메시지 제출 (publishMessage)
- **Merging**: AccQueue 병합
- **Processing**: 메시지 처리 + 증명 생성
- **Finalized**: tallyVerified=true, 결과 온체인 확정

## Component Structure

```
app/                         # Next App Router
src/
├── components/              # UI (투표/결과/제안 등)
├── crypto/                  # ECDH/EdDSA/DuplexSponge, 키 저장
├── workers/                 # 암호/증명 보조 워커
├── contractV2.ts            # MACI/Poll/Tally ABIs + 주소
└── wagmi.ts                 # 지갑/체인 설정

contracts/                   # MACI/Poll/MessageProcessor/Tally
circuits/                    # D1/D2/MACI 회로
coordinator/                 # 오프체인 집계/증명 자동화
```

## Data Flow (Runtime)

1. 프론트엔드에서 투표 선택 + 강도 입력
2. 클라이언트에서 메시지 암호화 후 `Poll.publishMessage()` 호출
3. `AccQueue`에 메시지 누적
4. 코디네이터가 병합/처리/증명 생성
5. `MessageProcessor.verify()` + `Tally.verify()` 통과
6. `Tally` 컨트랙트에 합산 결과 저장 (For/Against)

## Smart Contract Architecture

```
MACI.sol
 ├── signUp
 └── deployPoll

Poll.sol
 ├── publishMessage
 ├── mergeMaciStateAq
 └── mergeMessageAq

MessageProcessor.sol
 └── verify (state transition)

Tally.sol
 └── verify (tally proof) + results
```

Supporting:
- `AccQueue.sol` (Quinary accumulator)
- `VkRegistry.sol` (VK registry)
- Gatekeeper / VoiceCreditProxy

## Results UX (Default)

- **투표 종료 후** 기본 화면은 결과(집계) 페이지이다.
- 지갑 연결 없이도 종료된 제안의 결과를 볼 수 있다.
- 개별 투표는 공개되지 않으며 합산 결과만 노출된다.

## Network Configuration

| Network | Chain ID | Note |
|---------|----------|------|
| Sepolia | 11155111 | 테스트넷 배포 |
