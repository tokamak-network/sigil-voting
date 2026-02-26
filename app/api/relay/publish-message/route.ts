/**
 * Relayer API: POST /api/relay/publish-message
 *
 * Submits an encrypted MACI vote message on behalf of a voter (gasless).
 * Poll.publishMessage() does not use msg.sender — the relayer wallet can
 * submit on the voter's behalf without compromising privacy or security.
 *
 * Validation (format only, not content — message is encrypted):
 *   1. pollAddress is a registered poll in MACI
 *   2. encMessage length = 10, all elements are valid field elements
 *   3. encPubKeyX / encPubKeyY are valid field elements
 *   4. Voting period is still open
 *   5. Rate limit: 10 requests per IP per minute
 *
 * Nonce management: a per-process sequential queue prevents nonce collisions
 * under concurrent requests.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { createPublicClient, createWalletClient, http, parseAbi, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

// SNARK scalar field modulus — field elements must be strictly less than this
// Per CLAUDE.md: use & ((1n<<253n)-1n) mask, NOT % SNARK_SCALAR_FIELD
const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

function isValidFieldElement(value: bigint): boolean {
  return value >= 0n && value < SNARK_SCALAR_FIELD
}

// Minimal Poll ABI — only what the relayer needs
const POLL_ABI = parseAbi([
  'function publishMessage(uint256[10] calldata _encMessage, uint256 _encPubKeyX, uint256 _encPubKeyY) external',
  'function isVotingOpen() external view returns (bool)',
  'function getDeployTimeAndDuration() external view returns (uint256, uint256)',
])

// Minimal MACI ABI — to verify pollAddress is registered
const MACI_ABI = parseAbi([
  'function nextPollId() external view returns (uint256)',
  'function polls(uint256) external view returns (address)',
])

// --- Rate limiting (in-memory, per server process) ---
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_MAX = 10
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

// --- Nonce queue (sequential submission to avoid nonce collisions) ---
// Uses a promise chain so concurrent requests are serialized.
let nonceQueue: Promise<void> = Promise.resolve()

function enqueueTx<T>(fn: () => Promise<T>): Promise<T> {
  const result = nonceQueue.then(fn)
  // The queue continues even if this tx fails
  nonceQueue = result.then(
    () => {},
    () => {},
  )
  return result
}

// --- Viem clients (lazy initialized, module-level singletons) ---
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
    // Fall back to reading from config.json at module load
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

// --- Input parsing helpers ---
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
  // Rate limit check
  const ip = getClientIp(req)
  const { limited, retryAfter } = checkRateLimit(ip)
  if (limited) {
    return NextResponse.json({ error: 'rate_limited', retryAfter }, { status: 429 })
  }

  // Parse JSON body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { pollAddress, encMessage, encPubKeyX, encPubKeyY } = body as Record<string, unknown>

  // Validate pollAddress
  if (typeof pollAddress !== 'string' || !isAddress(pollAddress)) {
    return NextResponse.json({ error: 'invalid_pollAddress' }, { status: 400 })
  }
  const pollAddr = pollAddress as `0x${string}`

  // Validate encMessage array
  if (!Array.isArray(encMessage) || encMessage.length !== 10) {
    return NextResponse.json(
      { error: 'invalid_encMessage', detail: 'must be array of 10 elements' },
      { status: 400 },
    )
  }

  let encMessageBigInts: bigint[]
  try {
    encMessageBigInts = encMessage.map((v: unknown, i: number) =>
      parseBigIntHex(v, `encMessage[${i}]`),
    )
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'invalid_encMessage', detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  for (let i = 0; i < encMessageBigInts.length; i++) {
    if (!isValidFieldElement(encMessageBigInts[i])) {
      return NextResponse.json(
        { error: 'invalid_encMessage', detail: `encMessage[${i}] exceeds field size` },
        { status: 400 },
      )
    }
  }

  // Validate encPubKeyX / encPubKeyY
  let encPubKeyXBig: bigint
  let encPubKeyYBig: bigint
  try {
    encPubKeyXBig = parseBigIntHex(encPubKeyX, 'encPubKeyX')
    encPubKeyYBig = parseBigIntHex(encPubKeyY, 'encPubKeyY')
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'invalid_encPubKey', detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  if (encPubKeyXBig === 0n && encPubKeyYBig === 0n) {
    return NextResponse.json({ error: 'invalid_encPubKey', detail: 'zero key not allowed' }, { status: 400 })
  }

  if (!isValidFieldElement(encPubKeyXBig) || !isValidFieldElement(encPubKeyYBig)) {
    return NextResponse.json(
      { error: 'invalid_encPubKey', detail: 'key coordinates exceed field size' },
      { status: 400 },
    )
  }

  // On-chain validation
  try {
    const publicClient = getPublicClient()

    // Verify pollAddress is a registered MACI poll
    const maciAddress = getMaciAddress()
    const nextPollId = await publicClient.readContract({
      address: maciAddress,
      abi: MACI_ABI,
      functionName: 'nextPollId',
    })

    // Verify pollAddress is a registered MACI poll — parallel fetch all at once
    const pollIds = Array.from({ length: Number(nextPollId) }, (_, i) => BigInt(i))
    const registeredAddrs = await Promise.all(
      pollIds.map(pollId =>
        publicClient.readContract({
          address: maciAddress,
          abi: MACI_ABI,
          functionName: 'polls',
          args: [pollId],
        }),
      ),
    )
    const isRegisteredPoll = registeredAddrs.some(
      addr => addr.toLowerCase() === pollAddr.toLowerCase(),
    )

    if (!isRegisteredPoll) {
      return NextResponse.json({ error: 'unknown_poll' }, { status: 400 })
    }

    // Verify voting period is open
    const isOpen = await publicClient.readContract({
      address: pollAddr,
      abi: POLL_ABI,
      functionName: 'isVotingOpen',
    })

    if (!isOpen) {
      return NextResponse.json({ error: 'voting_closed' }, { status: 400 })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // If the error is our own validation error, propagate it
    if (msg.includes('RELAYER_') || msg.includes('MACI address')) {
      console.error('[relayer] config error:', msg)
      return NextResponse.json({ error: 'server_config_error' }, { status: 500 })
    }
    // Otherwise it's an RPC error
    console.error('[relayer] on-chain validation error:', msg)
    return NextResponse.json({ error: 'rpc_error', detail: msg }, { status: 502 })
  }

  // Submit transaction via sequential nonce queue
  try {
    const txHash = await enqueueTx(async () => {
      const walletClient = getWalletClient()

      const msgTuple = encMessageBigInts as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hash = await (walletClient as any).writeContract({
        address: pollAddr,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        chain: sepolia,
        args: [msgTuple, encPubKeyXBig, encPubKeyYBig],
      }) as `0x${string}`

      // Return the hash immediately — do NOT await receipt.
      // Sepolia block time (~12s) exceeds Vercel's 10s serverless timeout.
      // The client calls waitForTransactionReceipt on its own publicClient.
      return hash
    })

    return NextResponse.json({ txHash })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Do not log the private key even in error paths — it never appears in msg
    console.error('[relayer] tx submission error:', msg)
    // Do not forward raw RPC error messages to client — they may contain internal details
    return NextResponse.json({ error: 'tx_failed' }, { status: 500 })
  }
}
