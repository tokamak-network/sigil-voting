'use client'

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useTranslation } from '../../i18n'
import {
  TIMELOCK_EXECUTOR_ADDRESS,
  TIMELOCK_EXECUTOR_ABI,
} from '../../contractV2'
import { ExecutionTimeline } from './ExecutionTimeline'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// State enum matching contract: 0=None, 1=Registered, 2=Scheduled, 3=Executed, 4=Cancelled
const STATE_LABELS = ['none', 'registered', 'scheduled', 'executed', 'cancelled'] as const
type ExecutionState = (typeof STATE_LABELS)[number]

interface ExecutionPanelProps {
  pollId: number
}

export function ExecutionPanel({ pollId }: ExecutionPanelProps) {
  const { t } = useTranslation()
  const isConfigured = TIMELOCK_EXECUTOR_ADDRESS !== ZERO_ADDRESS

  const { data: stateRaw } = useReadContract({
    address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
    abi: TIMELOCK_EXECUTOR_ABI,
    functionName: 'getState',
    args: [BigInt(pollId)],
    query: { enabled: isConfigured },
  })

  const { data: canScheduleResult } = useReadContract({
    address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
    abi: TIMELOCK_EXECUTOR_ABI,
    functionName: 'canSchedule',
    args: [BigInt(pollId)],
    query: { enabled: isConfigured && stateRaw === 1 },
  })

  const { data: canExecuteResult } = useReadContract({
    address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
    abi: TIMELOCK_EXECUTOR_ABI,
    functionName: 'canExecute',
    args: [BigInt(pollId)],
    query: { enabled: isConfigured && stateRaw === 2 },
  })

  const { data: executionData } = useReadContract({
    address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
    abi: TIMELOCK_EXECUTOR_ABI,
    functionName: 'getExecution',
    args: [BigInt(pollId)],
    query: { enabled: isConfigured && (stateRaw !== undefined && stateRaw !== 0) },
  })

  // Schedule action
  const { writeContract: writeSchedule, data: scheduleTxHash, isPending: isScheduling } = useWriteContract()
  const { isLoading: isScheduleConfirming } = useWaitForTransactionReceipt({ hash: scheduleTxHash })

  // Execute action
  const { writeContract: writeExecute, data: executeTxHash, isPending: isExecuting } = useWriteContract()
  const { isLoading: isExecuteConfirming } = useWaitForTransactionReceipt({ hash: executeTxHash })

  // Cancel action
  const { writeContract: writeCancel, data: cancelTxHash, isPending: isCancelling } = useWriteContract()
  const { isLoading: isCancelConfirming } = useWaitForTransactionReceipt({ hash: cancelTxHash })

  if (!isConfigured) return null

  const stateNum = Number(stateRaw ?? 0)
  const state: ExecutionState = STATE_LABELS[stateNum] || 'none'

  if (state === 'none') return null

  const handleSchedule = () => {
    writeSchedule({
      address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
      abi: TIMELOCK_EXECUTOR_ABI,
      functionName: 'schedule',
      args: [BigInt(pollId)],
    })
  }

  const handleExecute = () => {
    writeExecute({
      address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
      abi: TIMELOCK_EXECUTOR_ABI,
      functionName: 'execute',
      args: [BigInt(pollId)],
    })
  }

  const handleCancel = () => {
    writeCancel({
      address: TIMELOCK_EXECUTOR_ADDRESS as `0x${string}`,
      abi: TIMELOCK_EXECUTOR_ABI,
      functionName: 'cancel',
      args: [BigInt(pollId)],
    })
  }

  // Parse execution data
  const scheduledAt = executionData ? Number((executionData as any)[6]) : 0
  const timelockDelay = executionData ? Number((executionData as any)[4]) : 0
  const target = executionData ? (executionData as any)[2] as string : ''

  const stateLabel = {
    registered: t.governance.execution.registered,
    scheduled: t.governance.execution.scheduled,
    executed: t.governance.execution.executed,
    cancelled: t.governance.execution.cancelled,
    none: t.governance.execution.none,
  }[state]

  const stateColor = {
    registered: 'bg-amber-100 text-amber-700 border-amber-300',
    scheduled: 'bg-blue-100 text-blue-700 border-blue-300',
    executed: 'bg-green-100 text-green-700 border-green-300',
    cancelled: 'bg-red-100 text-red-700 border-red-300',
    none: 'bg-slate-100 text-slate-700 border-slate-300',
  }[state]

  return (
    <div className="border-2 border-black bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold uppercase text-sm">{t.governance.execution.title}</h3>
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-sm ${stateColor}`}>
          {stateLabel}
        </span>
      </div>

      {/* Timeline visualization */}
      <ExecutionTimeline state={state} scheduledAt={scheduledAt} timelockDelay={timelockDelay} />

      {/* Target info */}
      {target && target !== ZERO_ADDRESS && (
        <div className="text-xs text-slate-500 font-mono truncate">
          {t.governance.execution.targetAddress}: {target}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {state === 'registered' && canScheduleResult && (
          <button
            onClick={handleSchedule}
            disabled={isScheduling || isScheduleConfirming}
            className="flex-1 bg-blue-600 text-white text-xs font-bold py-2 px-3 hover:bg-blue-700 transition-colors"
          >
            {isScheduling || isScheduleConfirming ? t.governance.execution.scheduling : t.governance.execution.schedule}
          </button>
        )}

        {state === 'scheduled' && canExecuteResult && (
          <button
            onClick={handleExecute}
            disabled={isExecuting || isExecuteConfirming}
            className="flex-1 bg-green-600 text-white text-xs font-bold py-2 px-3 hover:bg-green-700 transition-colors"
          >
            {isExecuting || isExecuteConfirming ? t.governance.execution.executing : t.governance.execution.execute}
          </button>
        )}

        {(state === 'registered' || state === 'scheduled') && (
          <button
            onClick={handleCancel}
            disabled={isCancelling || isCancelConfirming}
            className="bg-red-100 text-red-700 text-xs font-bold py-2 px-3 hover:bg-red-200 transition-colors border border-red-300"
          >
            {isCancelling || isCancelConfirming ? t.governance.execution.cancelling : t.governance.execution.cancel}
          </button>
        )}
      </div>
    </div>
  )
}
