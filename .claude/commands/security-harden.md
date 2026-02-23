---
name: security-harden
description: 보안 강화 — 헤더, 미들웨어, 검증, 에러 바운더리, 감사 로그 전체 구현
---

# Security Hardening (15 Categories)

아키텍처에 맞게 아래 15개 카테고리 전부 구현하고 테스트까지 작성.

## 구현 대상

### 1. Security Headers (`next.config.ts`)
`headers()` 함수에 7개 헤더 추가:
- CSP (default-src, script-src, style-src, font-src, connect-src, img-src, frame-ancestors)
- HSTS (`max-age=63072000; includeSubDomains; preload`)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- X-XSS-Protection: 1; mode=block

### 2. Middleware (`src/middleware.ts`)
- Rate Limiting: In-memory Map, 60 req/min, 429 응답
- CORS: Same-origin only, OPTIONS → 204
- CSRF: Origin 헤더 검증 (POST/PUT/DELETE)
- Path Blocking: /.env, /.git, /api/internal → 404
- SSRF: Internal IP regex blocking (127.x, 10.x, 192.168.x)

### 3. Input Validation (`src/lib/validation.ts`)
Zod 스키마:
- VoteInputSchema: choice (0|1), weight (int >=1), pollId (int >=0)
- PollCreateSchema: title (1..200, no script tags), description (0..1000), duration (300..604800)
- EthAddressSchema: `/^0x[a-fA-F0-9]{40}$/`

### 4. Error Boundaries
- `app/error.tsx` — 글로벌: prod에서 스택 숨김
- `app/(app)/error.tsx` — 앱 라우트: 투표 관련 에러 UI

### 5. Secret Exposure Prevention (`src/lib/envCheck.ts`)
- NEXT_PUBLIC_* 에 PRIVATE_KEY, SECRET, API_KEY 포함 시 throw

### 6. Audit Logging (`coordinator/src/auditLog.ts`)
- JSON 포맷: {timestamp, action, pollId, result, txHash?, error?}
- coordinator run.ts processPoll에 통합

### 7. Dependency Check
- package.json에 `"audit": "npm audit --audit-level=moderate"` 추가

## 테스트
`test/security-hardening.test.ts`에 15개 카테고리 전부 검증:
1. CORS/Preflight
2. CSRF
3. XSS+CSP
4. SSRF (Internal IP blocking)
5. AuthN/AuthZ
6. RBAC+Storage Isolation
7. Least Privilege (no secrets in client)
8. Input Validation
9. Rate Limiting
10. Cookie/Session (Web3 = no cookies)
11. Secret Management
12. HTTPS/HSTS + 7 Headers
13. Audit Log
14. Error Leak Prevention
15. Dependency Audit

## 검증
1. `npm test` — 기존 + 신규 테스트 전부 통과
2. `npm run audit` — dependency 취약점 확인
