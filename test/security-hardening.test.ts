/**
 * Security Hardening Tests — 15 Categories
 *
 * Validates all security controls added in the hardening phase:
 * CORS, CSRF, XSS/CSP, SSRF, AuthN/AuthZ, RBAC, Least Privilege,
 * Input Validation, Rate Limiting, Cookie/Session, Secret Mgmt,
 * HTTPS/HSTS, Audit Log, Error Leak, Dependency.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ====================================================================
// Helper: read next.config.ts and extract the securityHeaders array
// ====================================================================
function getSecurityHeadersFromConfig(): { key: string; value: string }[] {
  const configPath = resolve(__dirname, '../next.config.ts')
  const src = readFileSync(configPath, 'utf8')

  const headers: { key: string; value: string }[] = []
  // Match { key: '...', value: '...' } patterns
  const regex = /\{\s*key:\s*'([^']+)',\s*value:\s*(?:'([^']*)'|`([^`]*)`|\[[\s\S]*?\]\.join\(['"`](.*?)['"`]\))/g
  let match
  while ((match = regex.exec(src)) !== null) {
    headers.push({ key: match[1], value: match[2] || match[3] || '' })
  }

  // Also handle the CSP that uses array .join
  if (!headers.find(h => h.key === 'Content-Security-Policy')) {
    const cspMatch = src.match(/key:\s*'Content-Security-Policy'/)
    if (cspMatch) {
      headers.push({ key: 'Content-Security-Policy', value: 'present' })
    }
  }

  return headers
}

// ====================================================================
// 1. CORS / Preflight
// ====================================================================
describe('Security [1/15]: CORS/Preflight', () => {
  it('middleware exists and exports config with matcher', async () => {
    const mwPath = resolve(__dirname, '../src/middleware.ts')
    expect(existsSync(mwPath)).toBe(true)
    const src = readFileSync(mwPath, 'utf8')
    expect(src).toContain('OPTIONS')
    expect(src).toContain('Access-Control-Allow-Origin')
    expect(src).toContain('matcher')
  })

  it('middleware returns X-Frame-Options DENY', () => {
    const mwPath = resolve(__dirname, '../src/middleware.ts')
    const src = readFileSync(mwPath, 'utf8')
    expect(src).toContain("'X-Frame-Options'")
    expect(src).toContain("'DENY'")
  })
})

// ====================================================================
// 2. CSRF
// ====================================================================
describe('Security [2/15]: CSRF', () => {
  it('middleware validates Origin header for POST/PUT/DELETE', () => {
    const mwPath = resolve(__dirname, '../src/middleware.ts')
    const src = readFileSync(mwPath, 'utf8')
    expect(src).toContain("'POST'")
    expect(src).toContain("'PUT'")
    expect(src).toContain("'DELETE'")
    expect(src).toContain('origin')
    expect(src).toContain('host')
    expect(src).toContain('403')
  })

  it('wallet signature serves as built-in CSRF for voting', () => {
    const votePath = resolve(__dirname, '../src/components/voting/VoteFormV2.tsx')
    const src = readFileSync(votePath, 'utf8')
    // EdDSA signature = CSRF equivalent (requires wallet private key)
    expect(src).toContain('eddsaSign')
  })
})

// ====================================================================
// 3. XSS + CSP
// ====================================================================
describe('Security [3/15]: XSS + CSP', () => {
  it('next.config.ts contains Content-Security-Policy header', () => {
    const configPath = resolve(__dirname, '../next.config.ts')
    const src = readFileSync(configPath, 'utf8')
    expect(src).toContain('Content-Security-Policy')
    expect(src).toContain("default-src 'self'")
    expect(src).toContain("frame-ancestors 'none'")
  })

  it('CSP contains connect-src for RPC endpoints', () => {
    const configPath = resolve(__dirname, '../next.config.ts')
    const src = readFileSync(configPath, 'utf8')
    expect(src).toContain('connect-src')
    expect(src).toContain('publicnode.com')
    expect(src).toContain('alchemy.com')
  })
})

// ====================================================================
// 4. SSRF
// ====================================================================
describe('Security [4/15]: SSRF (Internal IP Blocking)', () => {
  it('middleware exports isInternalIp helper', async () => {
    const { isInternalIp } = await import('../src/middleware')
    expect(typeof isInternalIp).toBe('function')
  })

  it('blocks 127.0.0.1 (loopback)', async () => {
    const { isInternalIp } = await import('../src/middleware')
    expect(isInternalIp('127.0.0.1')).toBe(true)
  })

  it('blocks 10.x.x.x (private)', async () => {
    const { isInternalIp } = await import('../src/middleware')
    expect(isInternalIp('10.0.0.1')).toBe(true)
    expect(isInternalIp('10.255.255.255')).toBe(true)
  })

  it('blocks 192.168.x.x (private)', async () => {
    const { isInternalIp } = await import('../src/middleware')
    expect(isInternalIp('192.168.0.1')).toBe(true)
    expect(isInternalIp('192.168.255.255')).toBe(true)
  })

  it('blocks localhost', async () => {
    const { isInternalIp } = await import('../src/middleware')
    expect(isInternalIp('localhost')).toBe(true)
  })

  it('allows external IPs', async () => {
    const { isInternalIp } = await import('../src/middleware')
    expect(isInternalIp('8.8.8.8')).toBe(false)
    expect(isInternalIp('1.1.1.1')).toBe(false)
  })
})

// ====================================================================
// 5. AuthN / AuthZ
// ====================================================================
describe('Security [5/15]: AuthN/AuthZ', () => {
  it('VoteFormV2 requires wallet address to submit', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/voting/VoteFormV2.tsx'), 'utf8')
    expect(src).toContain("if (choice === null || !address) return")
  })

  it('CreatePollForm requires token gate check', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/CreatePollForm.tsx'), 'utf8')
    expect(src).toContain('canCreatePoll')
    expect(src).toContain('canCreate !== true')
  })
})

// ====================================================================
// 6. RBAC/ABAC + Storage Isolation
// ====================================================================
describe('Security [6/15]: RBAC + Storage Isolation', () => {
  it('storage keys are scoped per contract + address + pollId', () => {
    const src = readFileSync(resolve(__dirname, '../src/storageKeys.ts'), 'utf8')
    // Keys contain contract address prefix
    expect(src).toContain('MACI_V2_ADDRESS')
    expect(src).toContain('addr')
    expect(src).toContain('pollId')
  })
})

// ====================================================================
// 7. Least Privilege (No Secrets in Client)
// ====================================================================
describe('Security [7/15]: Least Privilege', () => {
  it('envCheck detects secrets in NEXT_PUBLIC_ vars', async () => {
    const { assertNoSecretExposure } = await import('../src/lib/envCheck')
    expect(typeof assertNoSecretExposure).toBe('function')

    // Should not throw normally (no NEXT_PUBLIC_PRIVATE_KEY set)
    expect(() => assertNoSecretExposure()).not.toThrow()
  })

  it('envCheck would throw if NEXT_PUBLIC_PRIVATE_KEY existed', async () => {
    const { assertNoSecretExposure } = await import('../src/lib/envCheck')
    // Simulate dangerous env var
    const original = process.env.NEXT_PUBLIC_PRIVATE_KEY
    process.env.NEXT_PUBLIC_PRIVATE_KEY = 'leaked'
    try {
      expect(() => assertNoSecretExposure()).toThrow('SECURITY')
    } finally {
      if (original === undefined) {
        delete process.env.NEXT_PUBLIC_PRIVATE_KEY
      } else {
        process.env.NEXT_PUBLIC_PRIVATE_KEY = original
      }
    }
  })
})

// ====================================================================
// 8. Input Validation (+ XSS / SQLi equivalent)
// ====================================================================
describe('Security [8/15]: Input Validation', () => {
  it('VoteInputSchema rejects invalid choice', async () => {
    const { VoteInputSchema } = await import('../src/lib/validation')
    const bad = VoteInputSchema.safeParse({ choice: 2, weight: 1, pollId: 0 })
    expect(bad.success).toBe(false)
  })

  it('VoteInputSchema accepts valid binary choice', async () => {
    const { VoteInputSchema } = await import('../src/lib/validation')
    expect(VoteInputSchema.safeParse({ choice: 0, weight: 1, pollId: 0 }).success).toBe(true)
    expect(VoteInputSchema.safeParse({ choice: 1, weight: 1, pollId: 0 }).success).toBe(true)
  })

  it('VoteInputSchema rejects negative weight', async () => {
    const { VoteInputSchema } = await import('../src/lib/validation')
    const bad = VoteInputSchema.safeParse({ choice: 0, weight: -1, pollId: 0 })
    expect(bad.success).toBe(false)
  })

  it('VoteInputSchema rejects negative pollId', async () => {
    const { VoteInputSchema } = await import('../src/lib/validation')
    const bad = VoteInputSchema.safeParse({ choice: 0, weight: 1, pollId: -1 })
    expect(bad.success).toBe(false)
  })

  it('PollCreateSchema rejects script tags in title', async () => {
    const { PollCreateSchema } = await import('../src/lib/validation')
    const bad = PollCreateSchema.safeParse({
      title: '<script>alert(1)</script>',
      description: '',
      duration: 3600,
    })
    expect(bad.success).toBe(false)
  })

  it('PollCreateSchema rejects title > 200 chars', async () => {
    const { PollCreateSchema } = await import('../src/lib/validation')
    const bad = PollCreateSchema.safeParse({
      title: 'a'.repeat(201),
      description: '',
      duration: 3600,
    })
    expect(bad.success).toBe(false)
  })

  it('PollCreateSchema rejects description > 1000 chars', async () => {
    const { PollCreateSchema } = await import('../src/lib/validation')
    const bad = PollCreateSchema.safeParse({
      title: 'Valid Title',
      description: 'x'.repeat(1001),
      duration: 3600,
    })
    expect(bad.success).toBe(false)
  })

  it('PollCreateSchema rejects duration < 300s', async () => {
    const { PollCreateSchema } = await import('../src/lib/validation')
    const bad = PollCreateSchema.safeParse({
      title: 'Valid Title',
      description: '',
      duration: 100,
    })
    expect(bad.success).toBe(false)
  })

  it('EthAddressSchema validates correct addresses', async () => {
    const { EthAddressSchema } = await import('../src/lib/validation')
    expect(EthAddressSchema.safeParse('0x' + 'a'.repeat(40)).success).toBe(true)
    expect(EthAddressSchema.safeParse('0x' + 'A'.repeat(40)).success).toBe(true)
    expect(EthAddressSchema.safeParse('not-an-address').success).toBe(false)
    expect(EthAddressSchema.safeParse('0x' + 'g'.repeat(40)).success).toBe(false)
    expect(EthAddressSchema.safeParse('0x' + 'a'.repeat(39)).success).toBe(false)
  })
})

// ====================================================================
// 9. Rate Limiting / Brute Force
// ====================================================================
describe('Security [9/15]: Rate Limiting', () => {
  it('middleware contains rate limiting logic', () => {
    const src = readFileSync(resolve(__dirname, '../src/middleware.ts'), 'utf8')
    expect(src).toContain('rateMap')
    expect(src).toContain('RATE_LIMIT')
    expect(src).toContain('429')
    expect(src).toContain('Too Many Requests')
  })

  it('rate limiter has reasonable threshold (60 req/min)', () => {
    const src = readFileSync(resolve(__dirname, '../src/middleware.ts'), 'utf8')
    expect(src).toContain('const RATE_LIMIT = 60')
    expect(src).toContain('const RATE_WINDOW_MS = 60_000')
  })
})

// ====================================================================
// 10. Cookie / Session (Web3 = no cookies)
// ====================================================================
describe('Security [10/15]: Cookie/Session', () => {
  it('no Set-Cookie usage (Web3 wallet auth only)', () => {
    // Middleware should not set cookies
    const mwSrc = readFileSync(resolve(__dirname, '../src/middleware.ts'), 'utf8')
    expect(mwSrc).not.toContain('Set-Cookie')
    expect(mwSrc).not.toContain('cookie')
  })

  it('no session library in package.json', () => {
    const pkgSrc = readFileSync(resolve(__dirname, '../package.json'), 'utf8')
    expect(pkgSrc).not.toContain('express-session')
    expect(pkgSrc).not.toContain('iron-session')
    expect(pkgSrc).not.toContain('next-auth')
  })
})

// ====================================================================
// 11. Secret Management
// ====================================================================
describe('Security [11/15]: Secret Management', () => {
  it('.gitignore includes .env patterns', () => {
    const gitignore = readFileSync(resolve(__dirname, '../.gitignore'), 'utf8')
    expect(gitignore).toContain('.env')
  })

  it('envCheck module exists and works', async () => {
    const { assertNoSecretExposure } = await import('../src/lib/envCheck')
    expect(() => assertNoSecretExposure()).not.toThrow()
  })
})

// ====================================================================
// 12. HTTPS / HSTS + All Security Headers
// ====================================================================
describe('Security [12/15]: HTTPS/HSTS + Security Headers', () => {
  const configSrc = readFileSync(resolve(__dirname, '../next.config.ts'), 'utf8')

  it('has Strict-Transport-Security header', () => {
    expect(configSrc).toContain('Strict-Transport-Security')
    expect(configSrc).toContain('max-age=63072000')
    expect(configSrc).toContain('includeSubDomains')
    expect(configSrc).toContain('preload')
  })

  it('has X-Frame-Options DENY', () => {
    expect(configSrc).toContain('X-Frame-Options')
    expect(configSrc).toContain('DENY')
  })

  it('has X-Content-Type-Options nosniff', () => {
    expect(configSrc).toContain('X-Content-Type-Options')
    expect(configSrc).toContain('nosniff')
  })

  it('has Referrer-Policy', () => {
    expect(configSrc).toContain('Referrer-Policy')
    expect(configSrc).toContain('strict-origin-when-cross-origin')
  })

  it('has Permissions-Policy', () => {
    expect(configSrc).toContain('Permissions-Policy')
    expect(configSrc).toContain('camera=()')
    expect(configSrc).toContain('microphone=()')
    expect(configSrc).toContain('geolocation=()')
  })

  it('has X-XSS-Protection', () => {
    expect(configSrc).toContain('X-XSS-Protection')
    expect(configSrc).toContain('1; mode=block')
  })

  it('has all 7 security headers defined', () => {
    const headerNames = [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'X-XSS-Protection',
    ]
    for (const name of headerNames) {
      expect(configSrc).toContain(name)
    }
  })
})

// ====================================================================
// 13. Audit Log
// ====================================================================
describe('Security [13/15]: Audit Log', () => {
  it('auditLog module exists', () => {
    const path = resolve(__dirname, '../coordinator/src/auditLog.ts')
    expect(existsSync(path)).toBe(true)
  })

  it('auditLog produces valid JSON with required fields', async () => {
    // Capture console.log output
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: string) => logs.push(msg)

    try {
      const { auditLog } = await import('../coordinator/src/auditLog')
      auditLog({ action: 'test', pollId: 1, result: 'success', txHash: '0xabc' })

      expect(logs.length).toBe(1)
      const parsed = JSON.parse(logs[0])
      expect(parsed).toHaveProperty('timestamp')
      expect(parsed).toHaveProperty('action', 'test')
      expect(parsed).toHaveProperty('pollId', 1)
      expect(parsed).toHaveProperty('result', 'success')
      expect(parsed).toHaveProperty('txHash', '0xabc')
      // Verify ISO timestamp format
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp)
    } finally {
      console.log = origLog
    }
  })

  it('auditLog handles failure entries', async () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (msg: string) => logs.push(msg)

    try {
      const { auditLog } = await import('../coordinator/src/auditLog')
      auditLog({ action: 'merge', pollId: 2, result: 'failure', error: 'revert' })

      const parsed = JSON.parse(logs[0])
      expect(parsed).toHaveProperty('result', 'failure')
      expect(parsed).toHaveProperty('error', 'revert')
    } finally {
      console.log = origLog
    }
  })

  it('run.ts imports and uses auditLog', () => {
    const runSrc = readFileSync(resolve(__dirname, '../coordinator/src/run.ts'), 'utf8')
    expect(runSrc).toContain("import { auditLog }")
    expect(runSrc).toContain("auditLog({")
  })
})

// ====================================================================
// 14. Error Leak Prevention
// ====================================================================
describe('Security [14/15]: Error Leak Prevention', () => {
  it('global error.tsx exists and hides stack in production', () => {
    const path = resolve(__dirname, '../app/error.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf8')
    expect(src).toContain("'use client'")
    // Stack only shown in development
    expect(src).toContain("process.env.NODE_ENV === 'development'")
    expect(src).toContain('Something went wrong')
  })

  it('app error.tsx exists for voting routes', () => {
    const path = resolve(__dirname, '../app/(app)/error.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf8')
    expect(src).toContain("'use client'")
    expect(src).toContain("process.env.NODE_ENV === 'development'")
  })

  it('VoteFormV2 shows generic error message, not raw errors', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/voting/VoteFormV2.tsx'), 'utf8')
    // Error handling shows translated generic messages, not raw err.message
    expect(src).toContain('errorGeneric')
    expect(src).toContain('errorRejectedFriendly')
    expect(src).toContain('errorGasFriendly')
  })

  it('coordinator sanitizes error messages (no raw stack)', () => {
    const src = readFileSync(resolve(__dirname, '../coordinator/src/run.ts'), 'utf8')
    // Error messages are sliced and redacted
    expect(src).toContain('[REDACTED]')
    expect(src).toContain('.slice(0,')
  })
})

// ====================================================================
// 15. Dependency Audit
// ====================================================================
describe('Security [15/15]: Dependency Check', () => {
  it('package.json has audit script', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
    expect(pkg.scripts.audit).toBe('npm audit --audit-level=moderate')
  })
})
