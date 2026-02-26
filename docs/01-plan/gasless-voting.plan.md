# Gasless Voting Plan

> **Status**: DRAFT
> **Created**: 2026-02-26
> **Scope**: MACI signUp + publishMessage gasless architecture

---

## 1. Current State: Where Gas is Required

SIGIL 투표 플로우에서 gas가 필요한 지점은 총 2~3개 on-chain 트랜잭션:

| Step | Contract Call | Gas Cost (est.) | `msg.sender` 의존? |
|------|---------------|----------------:|:-------------------:|
| **Registration** | `MACI.signUp(pubKeyX, pubKeyY, gatekeeperData, vcProxyData)` | ~300K gas | **YES** — gatekeeper + voiceCreditProxy 둘 다 `msg.sender` 사용 |
| **Key Change** (재투표 시) | `Poll.publishMessage(encMsg, encPubKeyX, encPubKeyY)` | ~200K gas | **NO** — 순수 데이터 enqueue |
| **Vote** | `Poll.publishMessage(encMsg, encPubKeyX, encPubKeyY)` | ~200K gas | **NO** — 순수 데이터 enqueue |

### 핵심 발견

```solidity
// MACI.sol:113-116 — signUp uses msg.sender
signUpGatekeeper.register(msg.sender, _signUpGatekeeperData);
uint256 voiceCreditBalance = voiceCreditProxy.getVoiceCredits(msg.sender, _initialVoiceCreditProxyData);

// Poll.sol:71-83 — publishMessage does NOT use msg.sender
function publishMessage(uint256[10] calldata _encMessage, uint256 _encPubKeyX, uint256 _encPubKeyY) external {
    if (block.timestamp > deployTime + duration) revert VotingEnded();
    if (_encPubKeyX == 0 && _encPubKeyY == 0) revert ZeroEncPubKey();
    uint256 leaf = hashMessageAndEncPubKey(_encMessage, _encPubKeyX, _encPubKeyY);
    messageAq.enqueue(leaf);
    emit MessagePublished(numMessages, _encMessage, _encPubKeyX, _encPubKeyY);
    numMessages++;
}
```

**`publishMessage`는 caller identity를 전혀 사용하지 않는다.** 암호화된 메시지와 ephemeral public key만 받아서 AccQueue에 넣을 뿐이다. 이것은 MACI의 핵심 보안 속성 덕분이다 — 메시지의 유효성은 EdDSA 서명으로 검증되므로, 누가 on-chain에 제출하든 무관하다.

**`signUp`은 반드시 본인이 호출해야 한다.** `msg.sender`로 gatekeeper 통과 여부와 토큰 잔고(voice credits)를 결정하기 때문이다.

---

## 2. MACI + Meta-transaction Compatibility

### publishMessage: 완벽하게 호환

MACI의 `publishMessage`는 meta-transaction에 이상적이다:

1. **msg.sender 무관**: 함수가 caller를 확인하지 않음
2. **EdDSA 서명이 권한 증명**: 메시지 내부에 voter의 EdDSA 서명이 DuplexSponge 암호화되어 있음. Coordinator가 복호화 후 서명을 검증하므로, 릴레이어가 제출해도 보안에 영향 없음
3. **No replay risk**: 메시지의 nonce가 ballot.nonce + 1이어야 유효. 같은 메시지를 두 번 제출해도 두 번째는 invalid로 처리됨 (index 0 routing)
4. **Privacy 유지**: 릴레이어는 암호화된 데이터만 볼 수 있어 투표 내용을 알 수 없음

### signUp: 직접 호환 불가

`signUp`에서 `msg.sender`를 사용하는 두 곳:
- `signUpGatekeeper.register(msg.sender, ...)` — 자격 검증
- `voiceCreditProxy.getVoiceCredits(msg.sender, ...)` — 토큰 잔고 조회

ERC-2771을 적용하려면 MACI 컨트랙트를 수정해야 하며 (`msg.sender` → `_msgSender()`), 이는 **MACI 스펙 바이블 변경**에 해당한다.

---

## 3. Architecture Options

### Option A: OpenGSN (ERC-2771 Trusted Forwarder)

| Aspect | Details |
|--------|---------|
| **Mechanism** | ERC-2771 Forwarder가 `msg.sender`를 calldata 끝에 append. 수신 컨트랙트가 `_msgSender()`로 원래 sender를 복원 |
| **publishMessage 적용** | 불필요 — `msg.sender`를 안 쓰므로 forwarder 없이 릴레이어가 직접 호출 가능 |
| **signUp 적용** | MACI.sol을 `ERC2771Context` 상속으로 수정 필요 (바이블 변경) |
| **인프라** | OpenGSN Relay Hub (mainnet 존재, Sepolia도 지원) |
| **비용** | Relay operator에 수수료 지불 (ETH paymaster 필요) |
| **복잡도** | 높음 — 컨트랙트 수정 + paymaster 배포 + relay 설정 |

**장점**: 표준화된 접근, 생태계 도구 활용 가능
**단점**: 컨트랙트 수정 필수 (signUp), 과도한 인프라 오버헤드, Sepolia 릴레이 가용성 불확실

### Option B: 자체 릴레이어 서버 (Recommended)

| Aspect | Details |
|--------|---------|
| **Mechanism** | 1) 프론트엔드가 암호화된 메시지를 릴레이어 API에 POST 2) 릴레이어가 자체 지갑으로 `publishMessage()` 호출 |
| **publishMessage 적용** | 즉시 가능 — 컨트랙트 수정 없음 |
| **signUp 적용** | 릴레이어가 대신 호출 불가 (msg.sender 의존). 별도 설계 필요 (아래 상세) |
| **인프라** | Node.js/Express 서버 1대 + 릴레이어 지갑 (ETH 충전) |
| **비용** | 릴레이어 지갑의 ETH 소비 (~0.0005 ETH/vote on Sepolia) |
| **복잡도** | 낮음 — publishMessage는 단순 proxy, signUp은 별도 경로 |

**장점**: 컨트랙트 수정 제로, 최소 인프라, MACI와 자연스럽게 호환
**단점**: 릴레이어 서버 운영 필요, 릴레이어 지갑 ETH 관리 필요

### Option C: Gelato Network

| Aspect | Details |
|--------|---------|
| **Mechanism** | Gelato Relay SDK로 sponsored call. `msg.sender` = Gelato relay contract |
| **publishMessage 적용** | 가능 — `msg.sender` 무관하므로 Gelato가 대신 호출 가능 |
| **signUp 적용** | 불가 — `msg.sender`가 Gelato relay 주소가 되어 gatekeeper/voiceCredit 실패 |
| **인프라** | Gelato 대시보드 설정 + 1Balance 충전 |
| **비용** | Gelato 수수료 (gas + ~10-20% premium) |
| **복잡도** | 중간 — SDK 연동은 쉽지만 signUp 문제 해결 불가 |

**장점**: 서버 운영 불필요, 높은 신뢰성
**단점**: signUp 미지원, Sepolia 지원 제한적, 외부 의존성

---

## 4. Recommended Approach

### Phase 1: publishMessage Only Gasless (컨트랙트 수정 없음)

**Option B (자체 릴레이어)** 가 SIGIL에 최적이다.

**근거**:
1. **컨트랙트 수정 제로**: 바이블 스펙 변경 없이 구현 가능
2. **publishMessage의 msg.sender 무관성**: MACI 설계 자체가 릴레이를 허용
3. **SIGIL 규모 적합**: Sepolia testnet DAO — 수십~수백 투표자. 복잡한 인프라 불필요
4. **Coordinator 서버 재활용**: 이미 GitHub Actions cron으로 coordinator를 운영 중. 릴레이어는 동일 인프라에 추가 가능
5. **투표가 핵심**: 사용자는 투표할 때 gas가 없어서 이탈. signUp은 1회성이므로 우선순위 낮음

### Architecture

```
                          ┌──────────────┐
                          │  Voter's     │
                          │  Browser     │
                          └──────┬───────┘
                                 │
                    1. Encrypt vote (client-side)
                    2. EdDSA sign (client-side)
                    3. POST encrypted payload
                                 │
                          ┌──────▼───────┐
                          │   Relayer    │
                          │   Server    │
                          │  (Node.js)  │
                          └──────┬───────┘
                                 │
                    4. Validate format (not content)
                    5. publishMessage() with relayer wallet
                                 │
                          ┌──────▼───────┐
                          │  Poll.sol    │
                          │  (Sepolia)   │
                          └──────────────┘
```

### Relayer API

```
POST /api/relay/publish-message
Content-Type: application/json

{
  "pollAddress": "0x...",
  "encMessage": ["0x...", ...],     // 10 field elements (hex strings)
  "encPubKeyX": "0x...",
  "encPubKeyY": "0x..."
}

Response 200:
{ "txHash": "0x..." }

Response 429:
{ "error": "rate_limited", "retryAfter": 30 }
```

### Relayer Validation (format only, not content)

릴레이어는 투표 내용을 검증할 수 없고 해서도 안 된다 (암호화). 검증할 수 있는 것:

1. `pollAddress`가 MACI의 등록된 poll 중 하나인지 확인
2. `encMessage` 배열 길이 = 10
3. 모든 값이 유효한 field element인지 (< SNARK_SCALAR_FIELD)
4. 해당 poll의 투표 기간이 아직 열려 있는지
5. Rate limiting: 동일 IP에서 분당 N건 이하

### Phase 2 (Future): signUp Gasless

signUp을 gasless로 만드는 방법 (Phase 2에서 검토):

#### Option 2A: 컨트랙트 수정 — ERC-2771 적용
- MACI.sol에 `ERC2771Context` 상속
- `msg.sender` → `_msgSender()`로 교체 (2곳)
- Trusted Forwarder 배포
- **바이블 변경 필요** — 현재 규칙에서 불가

#### Option 2B: 릴레이어가 ETH 지급 후 사용자가 직접 signUp
- 릴레이어가 사용자 주소로 미량 ETH 전송 (faucet 역할)
- 사용자가 받은 ETH로 직접 signUp 트랜잭션 실행
- **바이블 변경 불필요**
- 단점: 2-step UX (ETH 수령 대기 → signUp)

#### Option 2C: Bundler (ERC-4337 Account Abstraction)
- 사용자가 Smart Account (counterfactual) 사용
- Paymaster가 gas 대납
- **바이블 변경 필요** — signUp의 msg.sender가 Smart Account 주소가 됨
- 복잡도 매우 높음

**Phase 1 권장: signUp은 현재 방식 유지 (사용자 직접 gas 지불).**
근거: signUp은 1회성이고, Sepolia faucet으로 테스트넷 ETH 획득이 쉬움. Mainnet 전환 시 Phase 2 재검토.

---

## 5. Required Changes

### 5.1 Contract Changes

**None.** `Poll.publishMessage()`는 `msg.sender`를 사용하지 않으므로 컨트랙트 수정 없이 릴레이어가 대신 호출 가능.

### 5.2 Frontend Changes

| File | Change |
|------|--------|
| `src/writeHelper.ts` | `writeContractGasless()` 함수 추가: relayer API POST |
| `src/components/voting/VoteFormV2.tsx` | `publishWithRetry()` 내부에서 gasless 모드 분기 |
| `src/config.ts` (or env) | `VITE_RELAYER_URL` 환경변수 추가 |
| New: `src/lib/relayer.ts` | Relayer API client (POST, retry, error handling) |

#### writeHelper.ts 변경 예시

```typescript
// 기존: 사용자 지갑으로 직접 전송
export async function writeContract(...) { ... }

// 추가: 릴레이어 경유 전송 (publishMessage 전용)
export async function relayPublishMessage(params: {
  pollAddress: `0x${string}`;
  encMessage: bigint[];
  encPubKeyX: bigint;
  encPubKeyY: bigint;
}): Promise<`0x${string}`> {
  const res = await fetch(`${RELAYER_URL}/api/relay/publish-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pollAddress: params.pollAddress,
      encMessage: params.encMessage.map(v => '0x' + v.toString(16)),
      encPubKeyX: '0x' + params.encPubKeyX.toString(16),
      encPubKeyY: '0x' + params.encPubKeyY.toString(16),
    }),
  });
  if (!res.ok) throw new Error(`Relay failed: ${res.status}`);
  const { txHash } = await res.json();
  return txHash;
}
```

#### VoteFormV2.tsx 변경 예시

```typescript
// publishWithRetry에서 gasless 분기
if (RELAYER_URL) {
  // Gasless: 릴레이어 경유
  return await relayPublishMessage({ pollAddress, encMessage, encPubKeyX: ephemeralPubKey[0], encPubKeyY: ephemeralPubKey[1] });
} else {
  // Fallback: 사용자 지갑으로 직접 전송
  return await writeContract({ ... });
}
```

### 5.3 Infrastructure Requirements

| Component | Details |
|-----------|---------|
| **Relayer Server** | Node.js + Express, 단일 엔드포인트. GitHub Actions runner 또는 별도 VPS |
| **Relayer Wallet** | Sepolia ETH 충전된 EOA. Private key를 환경변수로 관리 |
| **ETH Budget** | ~0.0005 ETH/vote. 1000 votes = ~0.5 ETH (Sepolia 무료) |
| **Rate Limiting** | IP 기반 + 선택적으로 poll별 제한. DDoS 방지 |
| **Monitoring** | Relayer wallet 잔고 알림 (< threshold → Slack/Discord 알림) |
| **Nonce Management** | 동시 요청 시 nonce 충돌 방지: queue 또는 nonce manager 필요 |

---

## 6. Implementation Difficulty & Risks

### Difficulty: LOW-MEDIUM

| Component | Difficulty | Effort |
|-----------|:----------:|--------|
| Relayer server (Express + viem) | Low | 1-2 days |
| Frontend gasless toggle | Low | 0.5 day |
| Nonce manager (concurrent txs) | Medium | 1 day |
| Rate limiting + abuse prevention | Low | 0.5 day |
| Testing (e2e gasless flow) | Medium | 1 day |
| **Total** | | **4-5 days** |

### Risks

| Risk | Severity | Mitigation |
|------|:--------:|-----------|
| **Relayer downtime** | Medium | Fallback to direct wallet submission. UI에서 자동 감지 후 전환 |
| **Relayer wallet drained** | Low (testnet) | Balance monitoring + auto-alert. Mainnet에서는 paymaster 검토 |
| **Nonce collision** | Medium | Sequential queue 또는 nonce manager. 동시 투표 시 발생 가능 |
| **Spam/DDoS** | Medium | Rate limiting (IP + poll). 유효하지 않은 메시지도 gas 소비하므로 중요 |
| **Privacy leak** | Low | 릴레이어는 암호화된 데이터만 봄. IP 로깅 최소화 필요 |
| **Front-running** | None | publishMessage 순서는 결과에 무영향 (MACI는 reverse order 처리) |

### signUp Gasless 미지원의 영향

- 사용자는 첫 투표 시 signUp용 gas가 여전히 필요 (~300K gas, Sepolia에서 ~0.001 ETH)
- 이후 모든 투표(재투표, 키 변경 포함)는 gasless
- Sepolia faucet으로 테스트넷 ETH를 쉽게 획득 가능하므로 실질적 장벽 낮음
- Mainnet 전환 시 Phase 2 (faucet 방식 또는 ERC-2771)로 해결

---

## Summary

| Aspect | Decision |
|--------|----------|
| **Approach** | Option B: 자체 릴레이어 서버 |
| **Scope** | Phase 1: publishMessage only (signUp은 기존 방식 유지) |
| **Contract changes** | None |
| **Bible compliance** | 100% — 스펙 변경 없음 |
| **Key insight** | `Poll.publishMessage()`가 `msg.sender`를 사용하지 않으므로 누구든 대신 제출 가능 |
| **signUp gasless** | Phase 2에서 검토 (Option 2B: ETH faucet 방식 권장) |
