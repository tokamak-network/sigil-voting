import { useState, useCallback, useMemo } from 'react'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { writeContract } from '../writeHelper'
import {
  MACI_V2_ADDRESS,
  TON_TOKEN_ADDRESS,
  MSG_PROCESSOR_VERIFIER_ADDRESS,
  TALLY_VERIFIER_ADDRESS,
  VK_REGISTRY_ADDRESS,
  MACI_ABI,
  DEFAULT_COORD_PUB_KEY_X,
  DEFAULT_COORD_PUB_KEY_Y,
} from '../contractV2'
import { storageKey } from '../storageKeys'
import { useTranslation } from '../i18n'
import { TransactionModal } from './voting/TransactionModal'

const ERC20_BALANCE_ABI = [
  {
    type: 'function' as const,
    name: 'balanceOf' as const,
    inputs: [{ name: 'account', type: 'address' as const }],
    outputs: [{ name: '', type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
] as const

interface CreatePollFormProps {
  onPollCreated: (pollId: number, pollAddress: `0x${string}`, title?: string, durationSeconds?: number) => void
  onSelectPoll?: (pollId: number) => void
}

type DurationPreset = '1m' | '5m' | '1h' | '3d' | '7d' | 'custom'

function getDurationPresets(t: ReturnType<typeof useTranslation>['t']): { key: DurationPreset; label: string; minutes: number }[] {
  return [
    { key: '1m', label: t.createPoll.preset1m, minutes: 1 },
    { key: '5m', label: t.createPoll.preset5m, minutes: 5 },
    { key: '1h', label: t.createPoll.preset1h, minutes: 60 },
    { key: '3d', label: t.createPoll.preset3d, minutes: 72 * 60 },
    { key: '7d', label: t.createPoll.preset7d, minutes: 168 * 60 },
    { key: 'custom', label: '', minutes: 0 },
  ]
}

export function CreatePollForm({ onPollCreated, onSelectPoll }: CreatePollFormProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()
  const DURATION_PRESETS = getDurationPresets(t)

  // Token gate eligibility check
  const { data: canCreate, isLoading: checkingEligibility } = useReadContract({
    address: MACI_V2_ADDRESS as `0x${string}`,
    abi: MACI_ABI,
    functionName: 'canCreatePoll',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: gateCount } = useReadContract({
    address: MACI_V2_ADDRESS as `0x${string}`,
    abi: MACI_ABI,
    functionName: 'proposalGateCount',
    query: { enabled: !!address },
  })

  const { data: gateInfo } = useReadContract({
    address: MACI_V2_ADDRESS as `0x${string}`,
    abi: MACI_ABI,
    functionName: 'proposalGates',
    args: [0n],
    query: { enabled: !!address && Number(gateCount || 0) > 0 },
  })

  const { data: tonBalance } = useReadContract({
    address: TON_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && Number(gateCount || 0) > 0 },
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('1h')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txStage, setTxStage] = useState<'idle' | 'submitting' | 'confirming' | 'waiting'>('idle')
  const [isCreated, setIsCreated] = useState(false)
  const [createdPollId, setCreatedPollId] = useState<number | null>(null)
  const [createdPollAddr, setCreatedPollAddr] = useState<`0x${string}` | null>(null)
  const [createdTitle, setCreatedTitle] = useState('')

  const handleSubmit = useCallback(async () => {
    if (!address || !title.trim()) return
    setIsSubmitting(true)
    setError(null)
    setTxStage('submitting')

    try {
      const durationSeconds = BigInt(durationMinutes * 60)

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
              localStorage.setItem(storageKey.pollTitle(newPollId), title.trim())
              if (description.trim()) {
                localStorage.setItem(storageKey.pollDesc(newPollId), description.trim())
              }

              setCreatedPollId(newPollId)
              setCreatedPollAddr(pollAddr)
              setCreatedTitle(title.trim())
              setIsCreated(true)
              onPollCreated(newPollId, pollAddr, title.trim(), durationMinutes * 60)
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
                localStorage.setItem(storageKey.pollTitle(newPollId), title.trim())
                if (description.trim()) {
                  localStorage.setItem(storageKey.pollDesc(newPollId), description.trim())
                }
                setCreatedPollId(newPollId)
                setCreatedPollAddr(pollAddr)
                setCreatedTitle(title.trim())
                setIsCreated(true)
                onPollCreated(newPollId, pollAddr, title.trim(), durationMinutes * 60)
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
  }, [address, title, description, durationMinutes, publicClient, onPollCreated, t])

  const titleLen = title.trim().length
  const descLen = description.length
  const titleValid = titleLen >= 3 && titleLen <= 200
  const descValid = descLen <= 1000

  const handlePresetSelect = useCallback((preset: DurationPreset) => {
    setDurationPreset(preset)
    const found = DURATION_PRESETS.find((p) => p.key === preset)
    if (found && found.minutes > 0) {
      setDurationMinutes(found.minutes)
    }
  }, [])

  const formattedDuration = useMemo(() => {
    if (durationMinutes < 60) return `${durationMinutes}min`
    if (durationMinutes < 1440) {
      const h = Math.floor(durationMinutes / 60)
      const m = durationMinutes % 60
      return m === 0 ? `${h}h` : `${h}h ${m}m`
    }
    const days = Math.floor(durationMinutes / 1440)
    const remainingH = Math.floor((durationMinutes % 1440) / 60)
    if (remainingH === 0) return `${days} day${days > 1 ? 's' : ''}`
    return `${days}d ${remainingH}h`
  }, [durationMinutes])

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

  // Checking eligibility
  if (checkingEligibility) {
    return (
      <div className="w-full px-6 py-16">
        <div className="flex items-center justify-center gap-3">
          <span className="spinner" aria-hidden="true" />
          <span className="font-mono text-sm text-slate-500">{t.createPoll.checkingEligibility}</span>
        </div>
      </div>
    )
  }

  // Not eligible - show token requirement
  if (canCreate === false && Number(gateCount || 0) > 0) {
    const threshold = gateInfo ? formatEther((gateInfo as [string, bigint])[1]) : '100'
    const balance = tonBalance ? formatEther(tonBalance as bigint) : '0'
    return (
      <div className="w-full px-6 py-16">
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-8">
          <div className="w-20 h-20 bg-red-500 text-white technical-border flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl">block</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-black uppercase italic text-center tracking-tight">
            {t.createPoll.errorTokens}
          </h2>
          <p className="text-slate-600 text-lg text-center max-w-lg">
            {t.createPoll.tokenRequired}
          </p>
          <div className="technical-border bg-white p-8 w-full max-w-lg">
            <div className="flex items-center justify-between py-3 border-b border-slate-200">
              <span className="font-display font-bold uppercase text-sm">TON</span>
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-widest">{t.createPoll.required}</div>
                <div className="text-xl font-mono font-bold">{Number(threshold).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500">{t.createPoll.yourBalance}</span>
              <span className="text-xl font-mono font-bold text-red-500">{Number(balance).toLocaleString()}</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
      {/* Left: Form */}
      <div className="lg:col-span-8 space-y-8">
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
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
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
                    {t.createPoll.presetCustom}
                  </span>
                ) : (
                  preset.label
                )}
              </button>
            ))}
          </div>
          {durationPreset === 'custom' && (
            <div className="mt-4">
              <input
                type="number"
                min={1}
                max={43200}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, Math.min(43200, Number(e.target.value))))}
                disabled={isSubmitting}
                className="technical-input w-full h-12 px-4 font-mono text-lg"
                placeholder={t.createPoll.minutesUnit}
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

      {/* Right: Guidelines */}
      <div className="lg:col-span-4">
        <div className="bg-white p-8 border-2 border-border-light dark:border-border-dark sticky top-32">
          <h3 className="flex items-center gap-2 text-xl font-display font-bold uppercase mb-8">
            <span className="material-symbols-outlined text-primary">gavel</span>
            {t.createPoll.guidelinesTitle}
          </h3>
          <div className="space-y-6">
            {([
              { num: '01', title: t.createPoll.stakingTitle, desc: t.createPoll.stakingDesc },
              { num: '02', title: t.createPoll.privacyGuideTitle, desc: t.createPoll.privacyGuideDesc },
              { num: '03', title: t.createPoll.windowTitle, desc: t.createPoll.windowDesc },
              { num: '04', title: t.createPoll.quorumTitle, desc: t.createPoll.quorumDesc },
            ]).map((item) => (
              <div key={item.num} className="flex gap-4">
                <span className="text-2xl font-display font-black text-primary leading-none">{item.num}</span>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">{item.title}</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
