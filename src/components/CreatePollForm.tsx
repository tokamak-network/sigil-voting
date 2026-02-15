/**
 * CreatePollForm - Proposal creation form with eligibility check
 *
 * Before showing the form, checks on-chain:
 *   1. canCreatePoll(address) — is the user eligible?
 *   2. proposalGateCount() + proposalGates(i) — what tokens are required?
 *
 * Shows clear token requirements and user's current balance.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, usePublicClient, useReadContract } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MSG_PROCESSOR_VERIFIER_ADDRESS,
  VK_REGISTRY_ADDRESS,
  MACI_ABI,
  DEFAULT_COORD_PUB_KEY_X,
  DEFAULT_COORD_PUB_KEY_Y,
} from '../contractV2'
import { useTranslation } from '../i18n'

interface CreatePollFormProps {
  onPollCreated: (pollId: number, pollAddress: `0x${string}`, title?: string) => void
}

interface TokenGateInfo {
  token: `0x${string}`
  threshold: bigint
  symbol: string
  userBalance: bigint
  eligible: boolean
}

const ERC20_BALANCE_ABI = [
  {
    type: 'function' as const,
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view' as const,
  },
] as const

export function CreatePollForm({ onPollCreated }: CreatePollFormProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const { t } = useTranslation()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationHours, setDurationHours] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Eligibility state
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true)
  const [canCreate, setCanCreate] = useState(false)
  const [gateInfo, setGateInfo] = useState<TokenGateInfo[]>([])
  const [isOwnerOnly, setIsOwnerOnly] = useState(false)

  // Read canCreatePoll from contract
  const { data: canCreateRaw } = useReadContract({
    address: MACI_V2_ADDRESS as `0x${string}`,
    abi: MACI_ABI,
    functionName: 'canCreatePoll',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read gate count
  const { data: gateCountRaw } = useReadContract({
    address: MACI_V2_ADDRESS as `0x${string}`,
    abi: MACI_ABI,
    functionName: 'proposalGateCount',
  })

  // Load token gate details + user balances
  useEffect(() => {
    if (!publicClient || !address) return
    const gateCount = Number(gateCountRaw || 0)

    if (gateCount === 0) {
      setIsOwnerOnly(true)
      setCanCreate(!!canCreateRaw)
      setGateInfo([])
      setIsCheckingEligibility(false)
      return
    }

    setIsOwnerOnly(false)
    setIsCheckingEligibility(true)

    const loadGates = async () => {
      const gates: TokenGateInfo[] = []
      for (let i = 0; i < gateCount; i++) {
        try {
          const [token, threshold] = await publicClient.readContract({
            address: MACI_V2_ADDRESS as `0x${string}`,
            abi: MACI_ABI,
            functionName: 'proposalGates',
            args: [BigInt(i)],
          }) as [string, bigint]

          let symbol = '???'
          let userBalance = 0n

          try {
            symbol = await publicClient.readContract({
              address: token as `0x${string}`,
              abi: ERC20_BALANCE_ABI,
              functionName: 'symbol',
            }) as string
          } catch { /* unknown token */ }

          try {
            userBalance = await publicClient.readContract({
              address: token as `0x${string}`,
              abi: ERC20_BALANCE_ABI,
              functionName: 'balanceOf',
              args: [address],
            }) as bigint
          } catch { /* 0 */ }

          gates.push({
            token: token as `0x${string}`,
            threshold: threshold,
            symbol,
            userBalance,
            eligible: userBalance >= threshold,
          })
        } catch { /* skip broken gate */ }
      }

      setGateInfo(gates)
      setCanCreate(gates.some((g) => g.eligible))
      setIsCheckingEligibility(false)
    }

    loadGates()
  }, [publicClient, address, gateCountRaw, canCreateRaw])

  const handleSubmit = useCallback(async () => {
    if (!address || !title.trim() || !canCreate) return
    setIsSubmitting(true)
    setError(null)

    try {
      const durationSeconds = BigInt(durationHours * 3600)

      const hash = await writeContractAsync({
        address: MACI_V2_ADDRESS as `0x${string}`,
        abi: MACI_ABI,
        functionName: 'deployPoll',
        args: [
          title.trim(),
          durationSeconds,
          DEFAULT_COORD_PUB_KEY_X,
          DEFAULT_COORD_PUB_KEY_Y,
          MSG_PROCESSOR_VERIFIER_ADDRESS as `0x${string}`,
          VK_REGISTRY_ADDRESS as `0x${string}`,
          2,
        ],
        gas: 15000000n,
      })

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        for (const log of receipt.logs) {
          if (log.topics.length >= 2) {
            const newPollId = parseInt(log.topics[1] as string, 16)
            if (log.data && log.data.length >= 66) {
              const pollAddr = ('0x' + log.data.slice(26, 66)) as `0x${string}`

              localStorage.setItem('maci-last-poll-id', newPollId.toString())
              localStorage.setItem('maci-last-poll-addr', pollAddr)
              localStorage.setItem(`maci-poll-title-${newPollId}`, title.trim())
              if (description.trim()) {
                localStorage.setItem(`maci-poll-desc-${newPollId}`, description.trim())
              }

              onPollCreated(newPollId, pollAddr, title.trim())
            }
            break
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('insufficient funds') || msg.includes('gas')) {
        setError(t.voteForm.errorGas)
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        setError(t.voteForm.errorRejected)
      } else if (msg.includes('InsufficientTokens')) {
        setError(t.createPoll.errorTokens)
      } else {
        setError(t.createPoll.error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [address, title, description, durationHours, canCreate, writeContractAsync, publicClient, onPollCreated, t])

  const titleLen = title.trim().length
  const descLen = description.length
  const titleValid = titleLen >= 3 && titleLen <= 200
  const descValid = descLen <= 1000

  // Loading state
  if (isCheckingEligibility) {
    return (
      <div className="create-poll-form">
        <div className="eligibility-check" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>{t.createPoll.checkingEligibility}</span>
        </div>
      </div>
    )
  }

  // Not eligible
  if (!canCreate) {
    return (
      <div className="create-poll-form">
        <div className="eligibility-denied" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">block</span>
          <h4>{t.createPoll.notEligible}</h4>
          {isOwnerOnly ? (
            <p>{t.createPoll.ownerOnly}</p>
          ) : (
            <>
              <p>{t.createPoll.tokenRequired}</p>
              <div className="token-gate-list">
                {gateInfo.map((gate, i) => (
                  <div key={i} className={`token-gate-item ${gate.eligible ? 'eligible' : 'not-eligible'}`}>
                    <span className="token-symbol">{gate.symbol}</span>
                    <span className="token-requirement">
                      {t.createPoll.required}: {formatTokenAmount(gate.threshold)}
                    </span>
                    <span className="token-balance">
                      {t.createPoll.yourBalance}: {formatTokenAmount(gate.userBalance)}
                    </span>
                    <span className={`token-status ${gate.eligible ? 'pass' : 'fail'}`}>
                      {gate.eligible ? '✓' : '✕'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Eligible — show form with token info banner
  return (
    <div className="create-poll-form">
      {gateInfo.length > 0 && (
        <div className="eligibility-pass">
          <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <span>{t.createPoll.eligible}</span>
          <span className="eligible-token">
            ({gateInfo.find((g) => g.eligible)?.symbol} — {formatTokenAmount(gateInfo.find((g) => g.eligible)?.userBalance || 0n)})
          </span>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="poll-title">{t.createPoll.titleLabel}</label>
        <input
          id="poll-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.createPoll.titlePlaceholder}
          disabled={isSubmitting}
          maxLength={200}
          aria-describedby="title-counter"
          aria-invalid={titleLen > 0 && !titleValid}
        />
        <span id="title-counter" className={`char-counter ${titleLen > 0 && !titleValid ? 'invalid' : ''}`}>
          {titleLen > 0 && titleLen < 3 ? t.createPoll.titleMin : `${titleLen}/200`}
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="poll-desc">{t.createPoll.descLabel}</label>
        <textarea
          id="poll-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.createPoll.descPlaceholder}
          disabled={isSubmitting}
          rows={3}
          maxLength={1000}
          aria-describedby="desc-counter"
        />
        <span id="desc-counter" className={`char-counter ${!descValid ? 'invalid' : ''}`}>
          {descLen}/1000
        </span>
      </div>

      <div className="form-group">
        <label htmlFor="poll-duration">{t.createPoll.durationLabel}</label>
        <div className="duration-input">
          <input
            id="poll-duration"
            type="range"
            min="1"
            max="72"
            value={durationHours}
            onChange={(e) => setDurationHours(Number(e.target.value))}
            disabled={isSubmitting}
            aria-valuetext={`${durationHours} ${t.createPoll.durationHours}`}
          />
          <span className="duration-value">
            {durationHours} {t.createPoll.durationHours}
          </span>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!titleValid || !descValid || isSubmitting || isPending}
        className="brutalist-btn submit-poll-btn"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? t.createPoll.submitting : t.createPoll.submit}
      </button>

      {error && <div className="error-banner" role="alert">{error}</div>}
    </div>
  )
}

function formatTokenAmount(amount: bigint): string {
  const str = amount.toString()
  if (str.length <= 18) {
    const decimal = str.padStart(18, '0')
    const whole = '0'
    const frac = decimal.slice(0, 2)
    return frac === '00' ? whole : `${whole}.${frac}`
  }
  const whole = str.slice(0, str.length - 18)
  const frac = str.slice(str.length - 18, str.length - 16)
  return frac === '00' ? whole : `${whole}.${frac}`
}
