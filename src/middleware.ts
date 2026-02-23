import { NextRequest, NextResponse } from 'next/server'

// --- Rate Limiting (in-memory, per-instance) ---
const rateMap = new Map<string, { count: number; ts: number }>()
const RATE_LIMIT = 60
const RATE_WINDOW_MS = 60_000

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now - entry.ts > RATE_WINDOW_MS) {
    rateMap.set(ip, { count: 1, ts: now })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT
}

// --- SSRF: Internal IP blocking ---
const INTERNAL_IP_REGEX =
  /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|localhost|::1|\[::1\])$/i

export function isInternalIp(ip: string): boolean {
  return INTERNAL_IP_REGEX.test(ip)
}

// --- Path blocking ---
const BLOCKED_PATHS = ['/.env', '/.git', '/api/internal']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Block sensitive paths
  for (const blocked of BLOCKED_PATHS) {
    if (pathname.startsWith(blocked)) {
      return new NextResponse(null, { status: 404 })
    }
  }

  // Rate limiting
  const ip = getClientIp(req)
  if (isRateLimited(ip)) {
    return new NextResponse('Too Many Requests', { status: 429 })
  }

  // CORS: same-origin only
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')

  if (req.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 })
    if (origin && host && new URL(origin).host === host) {
      res.headers.set('Access-Control-Allow-Origin', origin)
      res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    }
    return res
  }

  // CSRF: validate Origin header for state-changing methods
  const method = req.method.toUpperCase()
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return new NextResponse('Forbidden', { status: 403 })
        }
      } catch {
        return new NextResponse('Forbidden', { status: 403 })
      }
    }
  }

  const res = NextResponse.next()

  // Set X-Frame-Options on every response
  res.headers.set('X-Frame-Options', 'DENY')

  return res
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico|assets).*)',
}
