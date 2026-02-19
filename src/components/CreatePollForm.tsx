import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { writeContract } from '../writeHelper'
import {
  MACI_V2_ADDRESS,
  MSG_PROCESSOR_VERIFIER_ADDRESS,
  TALLY_VERIFIER_ADDRESS,
  VK_REGISTRY_ADDRESS,
  MACI_ABI,
  DEFAULT_COORD_PUB_KEY_X,
  DEFAULT_COORD_PUB_KEY_Y,
} from '../contractV2'
import { useTranslation } from '../i18n'
import { TransactionModal } from './voting/TransactionModal'

interface CreatePollFormProps {
  onPollCreated: (pollId: number, pollAddress: `0x${string}`, title?: string) => void
  onSelectPoll?: (pollId: number) => void
}

type DurationPreset = '3d' | '7d' | '14d' | 'custom'

const DURATION_PRESETS: { key: DurationPreset; labelKey: 'preset3d' | 'preset7d' | 'preset14d' | 'presetCustom'; hours: number }[] = [
  { key: '3d', labelKey: 'preset3d', hours: 72 },
  { key: '7d', labelKey: 'preset7d', hours: 168 },
  { key: '14d', labelKey: 'preset14d', hours: 336 },
  { key: 'custom', labelKey: 'presetCustom', hours: 0 },
]

export function CreatePollForm({ onPollCreated, onSelectPoll }: CreatePollFormProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationHours, setDurationHours] = useState(168)
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('7d')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txStage, setTxStage] = useState<'idle' | 'submitting' | 'confirming' | 'waiting'>('idle')
  const [isCreated, setIsCreated] = useState(false)
  const [createdPollId, setCreatedPollId] = useState<number | null>(null)
  const [createdPollAddr, setCreatedPollAddr] = useState<`0x${string}` | null>(null)
  const [createdTitle, setCreatedTitle] = useState('')

  // Check if user can create polls
  const [canCreate, setCanCreate] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  const { data: canCreateRaw } = useReadContract({
    address: MACI_V2_ADDRESS as `0x${string}`,
    abi: MACI_ABI,
    functionName: 'canCreatePoll',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  useEffect(() => {
    if (canCreateRaw === undefined) return
    setCanCreate(!!canCreateRaw)
    setIsChecking(false)
  }, [canCreateRaw])

  const handleSubmit = useCallback(async () => {
    if (!address || !title.trim() || !canCreate) return
    setIsSubmitting(true)
    setError(null)
    setTxStage('submitting')

    try {
      const durationSeconds = BigInt(durationHours * 3600)

      setTxStage('confirming')
      const hash = await writeContract({
        address: MACI_V2_ADDRESS as `0x${string}`,
        abi: MACI_ABI,
        functionName: 'deployPoll',
        args: [
          title.trim(),
          durationSeconds,
          DEFAULT_COORD_PUB_KEY_X,
          DEFAULT_COORD_PUB_KEY_Y,
          MSG_PROCESSOR_VERIFIER_ADDRESS as `0x${string}`,
          TALLY_VERIFIER_ADDRESS as `0x${string}`,
          VK_REGISTRY_ADDRESS as `0x${string}`,
          2,
        ],
        gas: 15000000n,
        account: address,
      })

      setTxStage('waiting')

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const deployPollEvent = {
          type: 'event' as const,
          name: 'DeployPoll' as const,
          inputs: [
            { name: 'pollId', type: 'uint256' as const, indexed: true },
            { name: 'pollAddr', type: 'address' as const, indexed: false },
            { name: 'messageProcessorAddr', type: 'address' as const, indexed: false },
            { name: 'tallyAddr', type: 'address' as const, indexed: false },
          ],
        }
        let parsed = false
        for (const log of receipt.logs) {
          try {
            const { parseEventLogs } = await import('viem')
            const events = parseEventLogs({ abi: [deployPollEvent], logs: [log] })
            if (events.length > 0) {
              const { pollId: newPollIdBig, pollAddr } = events[0].args as any
              const newPollId = Number(newPollIdBig)

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
              parsed = true
              break
            }
          } catch { /* not a DeployPoll event */ }
        }
        if (!parsed) {
          for (const log of receipt.logs) {
            if (log.topics.length >= 2) {
              const newPollId = parseInt(log.topics[1] as string, 16)
              if (log.data && log.data.length >= 130) {
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
  }, [address, title, description, durationHours, canCreate, publicClient, onPollCreated, t])

  const titleLen = title.trim().length
  const descLen = description.length
  const titleValid = titleLen >= 3 && titleLen <= 200
  const descValid = descLen <= 1000

  const handlePresetSelect = useCallback((preset: DurationPreset) => {
    setDurationPreset(preset)
    const found = DURATION_PRESETS.find((p) => p.key === preset)
    if (found && found.hours > 0) {
      setDurationHours(found.hours)
    }
  }, [])

  const formattedDuration = useMemo(() => {
    if (durationHours < 24) return `${durationHours} hours`
    const days = Math.floor(durationHours / 24)
    const remainingHours = durationHours % 24
    if (remainingHours === 0) return `${days} day${days > 1 ? 's' : ''}`
    return `${days}d ${remainingHours}h`
  }, [durationHours])

  // Transaction progress modal
  if (txStage !== 'idle') {
    const txSteps = [
      { key: 'submitting', label: t.createPoll.stageSubmitting },
      { key: 'confirming', label: t.createPoll.stageConfirming },
      { key: 'waiting', label: t.createPoll.stageWaiting },
    ]
    return (
      <div className="w-full px-6 py-16">
        <TransactionModal
          title={t.createPoll.submitting}
          steps={txSteps}
          currentStep={txStage}
        />
      </div>
    )
  }

  // Success screen
  if (isCreated && createdPollId !== null) {
    return (
      <div className="w-full px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          <div className="w-20 h-20 bg-primary text-white technical-border flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl">check_circle</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-black uppercase italic text-center tracking-tight">
            {t.createPoll.success}
          </h2>
          <p className="text-slate-500 text-lg text-center max-w-lg">
            {t.createPoll.successDesc}
          </p>
          <div className="technical-border bg-white p-8 w-full max-w-lg">
            <div className="border-l-4 border-primary pl-4 mb-4">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">{t.createPoll.titleLabel}</p>
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

  // Wallet not connected
  if (!isConnected) {
    return (
      <div className="w-full px-6 py-16">
        <div className="technical-card-heavy bg-white p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-slate-300 mb-4" aria-hidden="true">account_balance_wallet</span>
          <h2 className="font-display text-3xl font-black uppercase mb-4">{t.createPoll.title}</h2>
          <p className="text-slate-600">{t.maci.connectWallet}</p>
        </div>
      </div>
    )
  }

  // Loading
  if (isChecking) {
    return (
      <div className="w-full px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6" role="status">
          <div className="w-12 h-12 border-4 border-black border-t-primary animate-spin" />
          <span className="font-display font-bold text-lg uppercase tracking-wider">{t.createPoll.checkingEligibility}</span>
        </div>
      </div>
    )
  }

  // Not eligible
  if (!canCreate) {
    return (
      <div className="w-full px-6 py-16">
        <div className="technical-border bg-white p-10 max-w-2xl mx-auto" role="status">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-100 technical-border flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-2xl text-slate-400">block</span>
            </div>
            <div>
              <h4 className="font-display font-black text-xl uppercase tracking-tight mb-2">{t.createPoll.notEligible}</h4>
              <p className="text-slate-500 leading-relaxed">{t.createPoll.ownerOnly}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main form
  return (
    <div className="w-full px-6 py-12">
      <div className="mb-12">
        <h1 className="text-5xl md:text-6xl font-display font-black uppercase italic tracking-tight">
          {t.createPoll.title}
        </h1>
      </div>

      <div className="max-w-3xl space-y-8">
        {/* Proposal Title */}
        <div>
          <label
            htmlFor="poll-title"
            className="block font-display font-black text-sm uppercase tracking-widest mb-3"
          >
            {t.createPoll.titleLabel}
          </label>
          <input
            id="poll-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.createPoll.titlePlaceholder}
            disabled={isSubmitting}
            maxLength={200}
            className="technical-input w-full h-16 px-5 text-xl font-bold font-display bg-white placeholder:text-slate-300 placeholder:font-normal"
          />
          <div className="flex justify-between mt-2">
            <span className={`text-xs font-mono ${titleLen > 0 && titleLen < 3 ? 'text-red-500' : 'text-slate-400'}`}>
              {titleLen > 0 && titleLen < 3 ? t.createPoll.titleMin : ''}
            </span>
            <span className={`text-xs font-mono ${titleLen > 0 && !titleValid ? 'text-red-500' : 'text-slate-400'}`}>
              {titleLen}/200
            </span>
          </div>
        </div>

        {/* Voting Period Duration */}
        <div>
          <label className="block font-display font-black text-sm uppercase tracking-widest mb-3">
            {t.createPoll.durationLabel}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => handlePresetSelect(preset.key)}
                disabled={isSubmitting}
                className={`h-14 border-2 border-black font-display font-bold text-sm uppercase tracking-wide transition-colors ${
                  durationPreset === preset.key
                    ? 'bg-black text-white'
                    : 'bg-white text-black hover:bg-slate-50'
                }`}
              >
                {preset.key === 'custom' ? (
                  <span className="flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-sm">calendar_today</span>
                    {t.createPoll[preset.labelKey]}
                  </span>
                ) : (
                  t.createPoll[preset.labelKey]
                )}
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
                placeholder={t.createPoll.hoursUnit}
              />
              <p className="text-xs font-mono text-slate-400 mt-1">{t.createPoll.durationHint}</p>
            </div>
          )}
        </div>

        {/* Proposal Description */}
        <div>
          <label
            htmlFor="poll-desc"
            className="block font-display font-black text-sm uppercase tracking-widest mb-3"
          >
            {t.createPoll.descLabel}
          </label>
          <textarea
            id="poll-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.createPoll.descPlaceholder}
            disabled={isSubmitting}
            rows={8}
            maxLength={1000}
            className="technical-input w-full px-5 py-4 text-base bg-white placeholder:text-slate-300 resize-none leading-relaxed"
          />
          <div className="flex justify-end mt-2">
            <span className={`text-xs font-mono ${!descValid ? 'text-red-500' : 'text-slate-400'}`}>
              {descLen}/1000
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!titleValid || !descValid || isSubmitting || !address}
          className="cta-button w-full h-16 bg-primary text-white font-display font-black text-xl italic uppercase tracking-tight flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">bolt</span>
          {isSubmitting ? t.createPoll.submitting : t.createPoll.generateProposal}
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border-2 border-red-400 p-4 font-mono text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
