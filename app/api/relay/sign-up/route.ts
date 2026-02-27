/**
 * Relayer API: POST /api/relay/sign-up
 *
 * Registers a MACI voter on behalf of the user (gasless signUp).
 * MACI.signUp() only stores the pubKey in the state tree — msg.sender
 * is not recorded in the state leaf, so relayer submission is safe.
 * The EdDSA key (derived from personal_sign) is the real voter identity.
 *
 * Input:  { pubKeyX: hex, pubKeyY: hex }
 * Output: { txHash: hex, stateIndex: number }
 *
 * Rate limit: 3 requests per IP per minute (stricter than publish-message).
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createPublicClient, createWalletClient, http, parseAbi, isAddress, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

function isValidFieldElement(value: bigint): boolean {
  return value >= 0n && value < SNARK_SCALAR_FIELD
}

const MACI_ABI = parseAbi([
  'function signUp(uint256 _pubKeyX, uint256 _pubKeyY, bytes calldata _signUpGatekeeperData, bytes calldata _initialVoiceCreditProxyData) external returns (uint256)',
  'event SignUp(uint256 indexed _stateIndex, uint256 indexed _userPubKeyX, uint256 indexed _userPubKeyY, uint256 _voiceCreditBalance, uint256 _timestamp)',
])

// --- Rate limiting (stricter: 3/min for signUp) ---
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_MAX = 3
const RATE_WINDOW_MS = 60_000

function checkRateLimit(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return { limited: false, retryAfter: 0 }
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - entry.windowStart)) / 1000)
    return { limited: true, retryAfter }
  }
  return { limited: false, retryAfter: 0 }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// --- Nonce queue ---
let nonceQueue: Promise<void> = Promise.resolve()

function enqueueTx<T>(fn: () => Promise<T>): Promise<T> {
  const result = nonceQueue.then(fn)
  nonceQueue = result.then(
    () => {},
    () => {},
  )
  return result
}

// --- Viem clients ---
let _publicClient: ReturnType<typeof createPublicClient> | null = null
let _walletClient: ReturnType<typeof createWalletClient> | null = null

function getRpcUrl(): string {
  return (
    process.env.RELAYER_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    'https://ethereum-sepolia-rpc.publicnode.com'
  )
}

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: sepolia, transport: http(getRpcUrl()) })
  }
  return _publicClient
}

function getWalletClient() {
  if (!_walletClient) {
    const privateKey = (process.env.RELAYER_PRIVATE_KEY ?? '').trim()
    if (!privateKey || !privateKey.startsWith('0x')) {
      throw new Error('RELAYER_PRIVATE_KEY env var not set or invalid')
    }
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    _walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(getRpcUrl()),
    })
  }
  return _walletClient
}

function getMaciAddress(): `0x${string}` {
  const addr =
    process.env.NEXT_PUBLIC_CIRCUIT_MODE === 'prod'
      ? process.env.RELAYER_MACI_ADDRESS_PROD
      : process.env.RELAYER_MACI_ADDRESS_DEV
  if (!addr || !isAddress(addr)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cfg = require('../../../../src/config.json')
    const mode = process.env.NEXT_PUBLIC_CIRCUIT_MODE === 'prod' ? 'prod' : 'v2'
    const maciAddr = cfg[mode]?.maci
    if (!maciAddr || !isAddress(maciAddr)) {
      throw new Error('Cannot determine MACI address for relayer')
    }
    return maciAddr as `0x${string}`
  }
  return addr as `0x${string}`
}

function parseBigIntHex(value: unknown, fieldName: string): bigint {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a hex string`)
  }
  const s = value.startsWith('0x') ? value : `0x${value}`
  try {
    return BigInt(s)
  } catch {
    throw new Error(`${fieldName} is not a valid hex number`)
  }
}

// --- Main handler ---
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { limited, retryAfter } = checkRateLimit(ip)
  if (limited) {
    return NextResponse.json({ error: 'rate_limited', retryAfter }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { pubKeyX, pubKeyY } = body as Record<string, unknown>

  let pubKeyXBig: bigint
  let pubKeyYBig: bigint
  try {
    pubKeyXBig = parseBigIntHex(pubKeyX, 'pubKeyX')
    pubKeyYBig = parseBigIntHex(pubKeyY, 'pubKeyY')
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'invalid_pubKey', detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  if (pubKeyXBig === 0n && pubKeyYBig === 0n) {
    return NextResponse.json({ error: 'invalid_pubKey', detail: 'zero key not allowed' }, { status: 400 })
  }

  if (!isValidFieldElement(pubKeyXBig) || !isValidFieldElement(pubKeyYBig)) {
    return NextResponse.json(
      { error: 'invalid_pubKey', detail: 'key coordinates exceed field size' },
      { status: 400 },
    )
  }

  // Submit signUp transaction
  try {
    const { txHash, stateIndex } = await enqueueTx(async () => {
      const walletClient = getWalletClient()
      const publicClient = getPublicClient()
      const maciAddress = getMaciAddress()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hash = await (walletClient as any).writeContract({
        address: maciAddress,
        abi: MACI_ABI,
        functionName: 'signUp',
        chain: sepolia,
        args: [pubKeyXBig, pubKeyYBig, '0x' as `0x${string}`, '0x' as `0x${string}`],
      }) as `0x${string}`

      // Wait for receipt to parse the SignUp event for stateIndex
      let stateIdx = 0
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== maciAddress.toLowerCase()) continue
          try {
            const decoded = decodeEventLog({
              abi: MACI_ABI,
              data: log.data,
              topics: log.topics,
            })
            if (decoded.eventName === 'SignUp') {
              stateIdx = Number((decoded.args as { _stateIndex: bigint })._stateIndex)
            }
          } catch { /* not our event */ }
        }
      } catch {
        // If receipt times out, still return txHash — client will poll
      }

      return { txHash: hash, stateIndex: stateIdx }
    })

    return NextResponse.json({ txHash, stateIndex })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('RELAYER_') || msg.includes('MACI address')) {
      console.error('[relayer/sign-up] config error:', msg)
      return NextResponse.json({ error: 'server_config_error' }, { status: 500 })
    }
    console.error('[relayer/sign-up] tx error:', msg)
    return NextResponse.json({ error: 'tx_failed' }, { status: 500 })
  }
}
