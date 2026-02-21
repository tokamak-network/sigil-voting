'use client'

import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useTranslation } from '../../i18n'
import {
  TIMELOCK_EXECUTOR_ADDRESS,
  TIMELOCK_EXECUTOR_ABI,
} from '../../contractV2'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const DELAY_OPTIONS = [
  { key: '1h', seconds: 3600 },
  { key: '24h', seconds: 86400 },
  { key: '48h', seconds: 172800 },
  { key: '7d', seconds: 604800 },
] as const

interface ExecutionRegistrationFormProps {
  pollId: number
  tallyAddress: `0x${string}`
  onRegistered?: () => void
}

export function ExecutionRegistrationForm({ pollId, tallyAddress, onRegistered }: ExecutionRegistrationFormProps) {
  const { t } = useTranslation()
  const isConfigured = TIMELOCK_EXECUTOR_ADDRESS !== ZERO_ADDRESS

  const [targetAddress, setTargetAddress] = useState('')
  const [calldata, setCalldata] = useState('')
  const [selectedDelay, setSelectedDelay] = useState('24h')
  const [quorum, setQuorum] = useState('1')
  const [error, setError] = useState('')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (!isConfigured) return null

  const handleRegister = () => {
    setError('')

    if (!targetAddress || !targetAddress.startsWith('0x') || targetAddress.length !== 42) {
      setError(t.governance.execution.error)
      return
    }

    const delay = DELAY_OPTIONS.find(d => d.key === selectedDelay)?.seconds ?? 3600
    const calldataHex = calldata.startsWith('0x') ? calldata : `0x${calldata}`

    try {
      writeContract({
        address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
        abi: TIMELOCK_EXECUTOR_ABI,
        functionName: 'registerExecution',
        args: [
          BigInt(pollId),
          tallyAddress,
          targetAddress as `0x${string}`,
          calldataHex as `0x${string}`,
          BigInt(delay),
          BigInt(quorum || '1'),
        ],
      })
    } catch {
      setError(t.governance.execution.error)
    }
  }

  if (isSuccess) {
    onRegistered?.()
    return (
      <div className="bg-green-50 border-2 border-green-500 p-3 text-sm font-bold text-green-700">
        {t.governance.execution.success}
      </div>
    )
  }

  const delayLabels: Record<string, string> = {
    '1h': t.governance.execution.delayOptions.hour1,
    '24h': t.governance.execution.delayOptions.hour24,
    '48h': t.governance.execution.delayOptions.hour48,
    '7d': t.governance.execution.delayOptions.day7,
  }

  return (
    <div className="space-y-3">
      {/* Target */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
          {t.governance.execution.targetAddress}
        </label>
        <input
          type="text"
          value={targetAddress}
          onChange={(e) => setTargetAddress(e.target.value)}
          placeholder="0x..."
          className="w-full border-2 border-border-light dark:border-border-dark p-2 text-sm font-mono focus:outline-none focus:border-primary"
        />
      </div>

      {/* Calldata */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
          {t.governance.execution.calldata}
        </label>
        <input
          type="text"
          value={calldata}
          onChange={(e) => setCalldata(e.target.value)}
          placeholder="0x..."
          className="w-full border-2 border-border-light dark:border-border-dark p-2 text-sm font-mono focus:outline-none focus:border-primary"
        />
      </div>

      {/* Delay */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
          {t.governance.execution.delay}
        </label>
        <div className="flex gap-1">
          {DELAY_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSelectedDelay(opt.key)}
              className={`flex-1 text-xs font-bold py-1.5 border-2 transition-colors ${
                selectedDelay === opt.key
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-slate-500 border-slate-300 hover:border-black'
              }`}
            >
              {delayLabels[opt.key]}
            </button>
          ))}
        </div>
      </div>

      {/* Quorum */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
          {t.governance.execution.quorumLabel}
        </label>
        <input
          type="number"
          min="1"
          value={quorum}
          onChange={(e) => setQuorum(e.target.value)}
          className="w-24 border-2 border-border-light dark:border-border-dark p-2 text-sm font-mono focus:outline-none focus:border-primary"
        />
      </div>

      {error && <p className="text-red-500 text-xs font-bold">{error}</p>}

      <button
        onClick={handleRegister}
        disabled={isPending || isConfirming || !targetAddress}
        className="w-full bg-black text-white font-bold py-2 text-sm hover:bg-slate-800 transition-colors border-2 border-black disabled:opacity-50"
      >
        {isPending || isConfirming ? t.governance.execution.registering : t.governance.execution.register}
      </button>
    </div>
  )
}
