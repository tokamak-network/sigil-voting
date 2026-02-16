/**
 * CreatePollForm - Proposal creation form with eligibility check
 *
 * Before showing the form, checks on-chain:
 *   1. canCreatePoll(address) — is the user eligible?
 *   2. proposalGateCount() + proposalGates(i) — what tokens are required?
 *
 * Shows clear token requirements and user's current balance.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAccount, useWriteContract, usePublicClient, useReadContract } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MSG_PROCESSOR_VERIFIER_ADDRESS,
  VK_REGISTRY_ADDRESS,
  MACI_ABI,
  DEFAULT_COORD_PUB_KEY_X,
  DEFAULT_COORD_PUB_KEY_Y,
  TON_TOKEN_ADDRESS,
  DEPLOYER_ADDRESS,
} from '../contractV2'
import { useTranslation } from '../i18n'
import { TransactionModal } from './voting/TransactionModal'

interface CreatePollFormProps {
  onPollCreated: (pollId: number, pollAddress: `0x${string}`, title?: string) => void
  onSelectPoll?: (pollId: number) => void
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

type DurationPreset = '3d' | '7d' | '14d' | 'custom'

const DURATION_PRESETS: { key: DurationPreset; label: string; hours: number }[] = [
  { key: '3d', label: '3 Days', hours: 72 },
  { key: '7d', label: '7 Days', hours: 168 },
  { key: '14d', label: '14 Days', hours: 336 },
  { key: 'custom', label: 'Custom', hours: 0 },
]

export function CreatePollForm({ onPollCreated, onSelectPoll }: CreatePollFormProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const { t } = useTranslation()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationHours, setDurationHours] = useState(168) // default 7 days
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('7d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txStage, setTxStage] = useState<'idle' | 'submitting' | 'confirming' | 'waiting'>('idle')
  const [isCreated, setIsCreated] = useState(false)
  const [createdPollId, setCreatedPollId] = useState<number | null>(null)
  const [createdPollAddr, setCreatedPollAddr] = useState<`0x${string}` | null>(null)
  const [createdTitle, setCreatedTitle] = useState('')

  // Eligibility state
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true)
  const [canCreate, setCanCreate] = useState(false)
  const [gateInfo, setGateInfo] = useState<TokenGateInfo[]>([])
  const [isOwnerOnly, setIsOwnerOnly] = useState(false)
  const [isEnablingGate, setIsEnablingGate] = useState(false)
  const [gateEnabled, setGateEnabled] = useState(false)

  const isOwner = address?.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase()

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

  // Enable community proposal creation (owner adds TON token gate)
  const handleEnableGate = useCallback(async () => {
    if (!address || !isOwner) return
    setIsEnablingGate(true)
    setError(null)
    try {
      const hash = await writeContractAsync({
        address: MACI_V2_ADDRESS as `0x${string}`,
        abi: MACI_ABI,
        functionName: 'addProposalGate',
        args: [TON_TOKEN_ADDRESS, 1n],
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash })
      }
      setGateEnabled(true)
      setIsOwnerOnly(false)
      setCanCreate(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        setError(t.voteForm.errorRejected)
      } else {
        setError(t.createPoll.error)
      }
    } finally {
      setIsEnablingGate(false)
    }
  }, [address, isOwner, writeContractAsync, publicClient, t])

  const handleSubmit = useCallback(async () => {
    if (!address || !title.trim() || !canCreate) return
    setIsSubmitting(true)
    setError(null)
    setTxStage('submitting')

    try {
      const durationSeconds = BigInt(durationHours * 3600)

      setTxStage('confirming')
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

      setTxStage('waiting')

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

              setCreatedPollId(newPollId)
              setCreatedPollAddr(pollAddr)
              setCreatedTitle(title.trim())
              setIsCreated(true)
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
      setTxStage('idle')
    }
  }, [address, title, description, durationHours, canCreate, writeContractAsync, publicClient, onPollCreated, t])

  const titleLen = title.trim().length
  const descLen = description.length
  const titleValid = titleLen >= 3 && titleLen <= 200
  const descValid = descLen <= 1000

  // Handle duration preset selection
  const handlePresetSelect = useCallback((preset: DurationPreset) => {
    setDurationPreset(preset)
    const found = DURATION_PRESETS.find((p) => p.key === preset)
    if (found && found.hours > 0) {
      setDurationHours(found.hours)
    }
  }, [])

  // Compute formatted dates for display
  const formattedDuration = useMemo(() => {
    if (durationHours < 24) return `${durationHours} hours`
    const days = Math.floor(durationHours / 24)
    const remainingHours = durationHours % 24
    if (remainingHours === 0) return `${days} day${days > 1 ? 's' : ''}`
    return `${days}d ${remainingHours}h`
  }, [durationHours])

  // Network status indicator
  const networkOnline = !!publicClient

  // ─── Transaction progress modal ──────────────────────────────────
  if (txStage !== 'idle') {
    const txSteps = [
      { key: 'submitting', label: t.createPoll.stageSubmitting },
      { key: 'confirming', label: t.createPoll.stageConfirming },
      { key: 'waiting', label: t.createPoll.stageWaiting },
    ]
    return (
      <div className="w-full max-w-7xl mx-auto px-6 py-16">
        <TransactionModal
          title={t.createPoll.submitting}
          steps={txSteps}
          currentStep={txStage}
        />
      </div>
    )
  }

  // ─── Success screen ──────────────────────────────────────────────
  if (isCreated && createdPollId !== null) {
    return (
      <div className="w-full max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-primary text-white technical-border flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl">check_circle</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-display font-black uppercase italic text-center tracking-tight">
            {t.createPoll.success}
          </h2>
          <p className="text-slate-500 text-lg text-center max-w-lg">
            {t.createPoll.successDesc}
          </p>

          {/* Created proposal info */}
          <div className="technical-border bg-white p-8 w-full max-w-lg">
            <div className="border-l-4 border-primary pl-4 mb-4">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">Proposal Title</p>
              <p className="text-xl font-display font-bold">{createdTitle}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="material-symbols-outlined text-base">schedule</span>
              <span>{formattedDuration}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
            {onSelectPoll && (
              <button
                className="flex-1 h-14 bg-primary text-white font-display font-black text-lg uppercase italic tracking-tight cta-button flex items-center justify-center gap-2"
                onClick={() => {
                  if (createdPollAddr) onPollCreated(createdPollId, createdPollAddr, createdTitle)
                  onSelectPoll(createdPollId)
                }}
              >
                <span className="material-symbols-outlined">visibility</span>
                {t.createPoll.viewProposal}
              </button>
            )}
            <button
              className="flex-1 h-14 bg-black text-white font-display font-bold text-lg uppercase sharp-button flex items-center justify-center gap-2"
              onClick={() => {
                if (createdPollAddr) onPollCreated(createdPollId!, createdPollAddr, createdTitle)
                setIsCreated(false)
                setCreatedPollId(null)
                setCreatedPollAddr(null)
                setTitle('')
                setDescription('')
              }}
            >
              {t.createPoll.close}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Loading state ───────────────────────────────────────────────
  if (isCheckingEligibility) {
    return (
      <div className="w-full max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6" role="status">
          <div className="w-12 h-12 border-4 border-black border-t-primary animate-spin" />
          <span className="font-display font-bold text-lg uppercase tracking-wider">{t.createPoll.checkingEligibility}</span>
        </div>
      </div>
    )
  }

  // ─── Not eligible ────────────────────────────────────────────────
  if (!canCreate) {
    return (
      <div className="w-full max-w-7xl mx-auto px-6 py-16">
        <div className="technical-border bg-white p-10 max-w-2xl mx-auto" role="status">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-100 technical-border flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-slate-400">block</span>
            </div>
            <div>
              <h4 className="font-display font-black text-xl uppercase tracking-tight mb-2">{t.createPoll.notEligible}</h4>
              {isOwnerOnly ? (
                <p className="text-slate-500 leading-relaxed">{t.createPoll.ownerOnly}</p>
              ) : (
                <>
                  <p className="text-slate-500 mb-4">{t.createPoll.tokenRequired}</p>
                  <div className="space-y-3">
                    {gateInfo.map((gate, i) => (
                      <div
                        key={i}
                        className={`technical-border p-4 flex items-center justify-between ${gate.eligible ? 'bg-green-50 border-green-600' : 'bg-red-50 border-red-400'}`}
                      >
                        <div>
                          <span className="font-mono font-bold text-lg">{gate.symbol}</span>
                          <p className="text-xs text-slate-500 mt-1">
                            {t.createPoll.required}: {formatTokenAmount(gate.threshold)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">{t.createPoll.yourBalance}</p>
                          <p className="font-mono font-bold">{formatTokenAmount(gate.userBalance)}</p>
                        </div>
                        <div className={`w-8 h-8 flex items-center justify-center font-bold text-lg ${gate.eligible ? 'text-green-600' : 'text-red-500'}`}>
                          {gate.eligible ? '\u2713' : '\u2715'}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-4 max-w-2xl mx-auto bg-red-50 border-2 border-red-400 p-4 font-mono text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
      </div>
    )
  }

  // ─── Eligible: main form ─────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-12">
      {/* Page Title */}
      <div className="mb-12">
        <h1 className="text-5xl md:text-6xl font-display font-black uppercase italic tracking-tight">
          Create New Proposal
        </h1>
        <div className="mt-4 inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 technical-border border-primary/30">
          <span className="material-symbols-outlined text-sm">edit_note</span>
          <span className="font-mono text-xs font-bold uppercase tracking-widest">Draft Phase</span>
        </div>
      </div>

      {/* Admin gate enable banner */}
      {isOwner && isOwnerOnly && !gateEnabled && (
        <div className="technical-border bg-amber-50 border-amber-400 p-6 mb-8 flex items-start gap-4">
          <span className="material-symbols-outlined text-2xl text-amber-600 flex-shrink-0 mt-1">group_add</span>
          <div className="flex-1">
            <p className="text-sm text-slate-700 mb-3">{t.createPoll.enableCommunityDesc}</p>
            <button
              className="h-10 px-6 bg-black text-white font-display font-bold text-sm uppercase sharp-button"
              onClick={handleEnableGate}
              disabled={isEnablingGate}
            >
              {isEnablingGate ? t.createPoll.enabling : t.createPoll.enableCommunity}
            </button>
          </div>
        </div>
      )}

      {/* Gate enabled success */}
      {gateEnabled && (
        <div className="technical-border bg-green-50 border-green-600 p-4 mb-8 flex items-center gap-3">
          <span className="material-symbols-outlined text-green-600">check_circle</span>
          <span className="text-sm font-bold text-green-700">{t.createPoll.gateEnabledSuccess}</span>
        </div>
      )}

      {/* Eligibility pass banner */}
      {gateInfo.length > 0 && (
        <div className="technical-border bg-green-50 border-green-600 p-4 mb-8 flex items-center gap-3">
          <span className="material-symbols-outlined text-green-600">verified</span>
          <span className="text-sm font-bold text-green-700">{t.createPoll.eligible}</span>
          <span className="text-xs font-mono text-green-600">
            ({gateInfo.find((g) => g.eligible)?.symbol} &mdash; {formatTokenAmount(gateInfo.find((g) => g.eligible)?.userBalance || 0n)})
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* ── Left Column: Form ── */}
        <div className="lg:col-span-8 space-y-8">

          {/* Proposal Title */}
          <div>
            <label
              htmlFor="poll-title"
              className="block font-display font-black text-sm uppercase tracking-widest mb-3"
            >
              Proposal Title
            </label>
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
              className="technical-input w-full h-16 px-5 text-xl font-bold font-display bg-white placeholder:text-slate-300 placeholder:font-normal"
            />
            <div className="flex justify-between mt-2">
              <span className={`text-xs font-mono ${titleLen > 0 && titleLen < 3 ? 'text-red-500' : 'text-slate-400'}`}>
                {titleLen > 0 && titleLen < 3 ? t.createPoll.titleMin : ''}
              </span>
              <span id="title-counter" className={`text-xs font-mono ${titleLen > 0 && !titleValid ? 'text-red-500' : 'text-slate-400'}`}>
                {titleLen}/200
              </span>
            </div>
          </div>

          {/* Voting Period Duration */}
          <div>
            <label className="block font-display font-black text-sm uppercase tracking-widest mb-3">
              Voting Period Duration
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePresetSelect(preset.key)}
                  disabled={isSubmitting}
                  className={`h-12 border-2 border-black font-display font-bold text-sm uppercase tracking-wide transition-colors ${
                    durationPreset === preset.key
                      ? 'bg-black text-white'
                      : 'bg-white text-black hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {durationPreset === 'custom' && (
              <div className="mt-4">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={durationHours}
                  onChange={(e) => setDurationHours(Math.max(1, Math.min(720, Number(e.target.value))))}
                  disabled={isSubmitting}
                  className="technical-input w-full h-12 px-4 font-mono text-lg"
                  placeholder="Hours"
                />
                <p className="text-xs font-mono text-slate-400 mt-1">{t.createPoll.durationHint}</p>
              </div>
            )}
          </div>

          {/* Start / End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="start-date"
                className="block font-display font-black text-xs uppercase tracking-widest mb-2 text-slate-500"
              >
                Start Date
              </label>
              <input
                id="start-date"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isSubmitting}
                className="technical-input w-full h-12 px-4 font-mono text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="end-date"
                className="block font-display font-black text-xs uppercase tracking-widest mb-2 text-slate-500"
              >
                End Date
              </label>
              <input
                id="end-date"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isSubmitting}
                className="technical-input w-full h-12 px-4 font-mono text-sm"
              />
            </div>
          </div>

          {/* Proposal Description */}
          <div>
            <label
              htmlFor="poll-desc"
              className="block font-display font-black text-sm uppercase tracking-widest mb-3"
            >
              Proposal Description
            </label>
            <textarea
              id="poll-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.createPoll.descPlaceholder}
              disabled={isSubmitting}
              rows={12}
              maxLength={1000}
              aria-describedby="desc-counter"
              className="technical-input w-full px-5 py-4 text-base bg-white placeholder:text-slate-300 resize-none leading-relaxed"
            />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-slate-400 italic">Markdown Supported</span>
              <span
                id="desc-counter"
                className={`text-xs font-mono ${!descValid ? 'text-red-500' : 'text-slate-400'}`}
              >
                {descLen}/1000
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!titleValid || !descValid || isSubmitting || isPending}
            className="cta-button w-full h-16 bg-primary text-white font-display font-black text-xl italic uppercase tracking-tight flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            aria-busy={isSubmitting}
          >
            <span className="material-symbols-outlined text-2xl">bolt</span>
            {isSubmitting ? t.createPoll.submitting : 'Generate Proposal'}
          </button>

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border-2 border-red-400 p-4 font-mono text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
        </div>

        {/* ── Right Column: Guidelines Sidebar ── */}
        <div className="lg:col-span-4">
          <div className="guideline-box bg-white p-8 sticky top-32">
            <h3 className="font-display font-black text-lg uppercase tracking-tight mb-8">
              Proposal Guidelines
            </h3>

            <div className="space-y-6">
              <div className="flex gap-4">
                <span className="text-2xl font-display font-black text-primary leading-none">01</span>
                <div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Title should clearly describe the proposal intent. Aim for concise, action-oriented language.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="text-2xl font-display font-black text-primary leading-none">02</span>
                <div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Include sufficient context in the description so voters can make an informed decision.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="text-2xl font-display font-black text-primary leading-none">03</span>
                <div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Choose a voting duration that gives the community enough time to review and participate.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="text-2xl font-display font-black text-primary leading-none">04</span>
                <div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Once created, the proposal cannot be edited. All votes are encrypted via MACI.
                  </p>
                </div>
              </div>
            </div>

            {/* Network Status */}
            <div className="mt-8 pt-6 border-t-2 border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 ${networkOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                  {networkOnline ? 'Sepolia Connected' : 'Network Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
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
