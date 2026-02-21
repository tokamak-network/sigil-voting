'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '../../i18n'

interface ExecutionTimelineProps {
  state: 'none' | 'registered' | 'scheduled' | 'executed' | 'cancelled'
  scheduledAt: number
  timelockDelay: number
}

const STEPS = ['registered', 'scheduled', 'executed'] as const

export function ExecutionTimeline({ state, scheduledAt, timelockDelay }: ExecutionTimelineProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (state !== 'scheduled') return
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [state])

  if (state === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-red-500 text-xs font-bold">
        <span className="material-symbols-outlined text-sm">cancel</span>
        {t.governance.execution.cancelled}
      </div>
    )
  }

  const currentIdx = STEPS.indexOf(state as typeof STEPS[number])
  const executeAt = scheduledAt + timelockDelay
  const remaining = executeAt - now

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return t.governance.execution.readyToExecute
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  return (
    <div className="space-y-2">
      {/* Step indicators */}
      <div className="flex items-center gap-1">
        {STEPS.map((step, idx) => {
          const isDone = idx <= currentIdx
          const isCurrent = idx === currentIdx
          return (
            <div key={step} className="flex items-center gap-1 flex-1">
              <div
                className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold border-2 ${
                  isDone
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-slate-400 border-slate-300'
                } ${isCurrent ? 'ring-2 ring-primary ring-offset-1' : ''}`}
              >
                {isDone ? '✓' : idx + 1}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 ${idx < currentIdx ? 'bg-black' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400">
        <span>{t.governance.execution.registered}</span>
        <span>{t.governance.execution.scheduled}</span>
        <span>{t.governance.execution.executed}</span>
      </div>

      {/* Timelock countdown */}
      {state === 'scheduled' && remaining > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-2 text-xs font-mono text-blue-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">timer</span>
          {t.governance.execution.timelockRemaining}: {formatTime(remaining)}
        </div>
      )}

      {state === 'scheduled' && remaining <= 0 && (
        <div className="bg-green-50 border border-green-200 p-2 text-xs font-bold text-green-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          {t.governance.execution.readyToExecute}
        </div>
      )}
    </div>
  )
}
