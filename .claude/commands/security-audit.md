---
name: security-audit
description: 보안 현실 진단 — AI가 해준 것 vs 실제 공격면을 솔직하게 분석
---

# Security Reality Audit

AI 보안 강화의 한계를 인식하고, 실제 공격면을 진단한다.
체크리스트 수준이 아니라 실제 뚫리는지 관점에서 분석.

## Step 1: AI가 해준 것의 한계 분석

아래 항목별로 "실제 효과" vs "우회 가능성"을 솔직하게 평가:

| 구현 | 실제 효과 | 한계 |
|------|-----------|------|
| CSP 헤더 | XSS 일부 방어 | unsafe-eval/inline 허용 시 bypass 가능 |
| Rate limit (in-memory) | 단일 인스턴스 방어 | Vercel serverless = 인스턴스마다 별도, 재시작 시 초기화 |
| Zod 검증 | 클라이언트 사이드 | DevTools로 우회 가능, 서버 검증 아님 |
| Error boundary | 스택 숨김 | 정보 유출 방지 수준 |
| HSTS/X-Frame | 기본 방어 | 있으면 좋지만 핵심 공격면 아님 |

## Step 2: 실제 공격면 점검

### 2-1. 시크릿 노출 확인
```
# .env가 웹에서 직접 접근 가능한지 확인
curl -s https://{DEPLOY_URL}/.env
curl -s https://{DEPLOY_URL}/.git/config
curl -s https://{DEPLOY_URL}/api/internal
```

### 2-2. 클라이언트 번들에 시크릿 유출 확인
```
# 빌드 후 번들에서 private key 패턴 검색
npm run build
grep -r "PRIVATE_KEY\|0x[a-fA-F0-9]{64}" .next/static/ || echo "Clean"
grep -r "COORDINATOR" .next/static/ || echo "Clean"
```

### 2-3. Dependency 취약점 실태
```
npm audit --audit-level=moderate
# high/critical CVE 목록 추출, 실제 exploit 가능한 것 분류
```

### 2-4. RPC 엔드포인트 남용
- 프론트에서 직접 호출하는 RPC URL이 유료 키 포함하는지 확인
- publicnode.com 같은 공개 RPC면 OK, Alchemy/Infura 유료 키면 탈취 가능

### 2-5. GH Actions 시크릿 관리
- Actions secrets에 PRIVATE_KEY, COORDINATOR_PRIVATE_KEY 저장 상태 확인
- Workflow에서 시크릿이 로그에 출력되지 않는지 확인
- Fork PR에서 시크릿 접근 가능한지 확인 (pull_request_target 이슈)

### 2-6. 온체인 공격면
- 컨트랙트에 reentrancy, front-running 가능한 함수 확인
- MACI coordinator key가 온체인에 공개된 상태에서의 리스크

## Step 3: npm audit 상세 분석

```
npm audit --json > /tmp/audit.json
```

결과에서:
- **Critical/High**: 즉시 조치 필요한 것 분류
- **실제 exploit 가능**: 이 프로젝트에서 해당 경로가 사용되는지 확인
- **false positive**: devDependencies에만 있고 프로덕션에 영향 없는 것 분류

## Step 4: 결과 리포트

각 항목을 아래 형식으로 정리:

```
[CRITICAL] .env 웹 접근 가능 → 즉시 차단 필요
[HIGH]     npm audit high 33개 중 실제 영향 N개 → 업데이트 필요
[MEDIUM]   CSP unsafe-eval 허용 → snarkjs 의존, 당장 제거 불가
[LOW]      Rate limit serverless 한계 → Vercel Edge Middleware로 전환 검토
[INFO]     Web3 = no session/cookie → 전통적 session hijack 해당 없음
```

## 핵심 원칙

> "보안 강화해줘"로 AI가 해주는 건 **체크리스트 수준**.
> 실제 뚫리는지는 사람이 직접 확인해야 한다.
> CVE/RCE는 dependency에 이미 있고, 설정 실수 하나로 전부 노출된다.
