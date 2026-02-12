
interface PhaseIndicatorProps {
  phase: 0 | 1 | 2
  endTime: Date
  revealEndTime: Date
}

function formatTimeRemaining(targetTime: Date): string {
  const now = new Date()
  const diff = targetTime.getTime() - now.getTime()

  if (diff <= 0) return 'Ended'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function PhaseIndicator({ phase, endTime, revealEndTime }: PhaseIndicatorProps) {
  // Recalculate on every render (parent re-renders every second)
  const timeInfo = (() => {
    if (phase === 0) {
      return { label: 'Vote ends in', time: formatTimeRemaining(endTime) }
    } else if (phase === 1) {
      return { label: 'Reveal ends in', time: formatTimeRemaining(revealEndTime) }
    }
    return { label: 'Ended', time: '' }
  })()

  const isUrgent = (() => {
    const now = new Date()
    const targetTime = phase === 0 ? endTime : revealEndTime
    const diff = targetTime.getTime() - now.getTime()
    return diff > 0 && diff < 60 * 60 * 1000 // Less than 1 hour
  })()

  return (
    <div className="uv-phase-indicator">
      <div className="uv-phase-steps">
        <div className={`uv-phase-step ${phase >= 0 ? 'active' : ''} ${phase === 0 ? 'current' : ''}`}>
          <span className="uv-phase-dot">●</span>
          <span className="uv-phase-label">Vote</span>
        </div>
        <div className="uv-phase-line" />
        <div className={`uv-phase-step ${phase >= 1 ? 'active' : ''} ${phase === 1 ? 'current' : ''}`}>
          <span className="uv-phase-dot">●</span>
          <span className="uv-phase-label">Reveal</span>
        </div>
        <div className="uv-phase-line" />
        <div className={`uv-phase-step ${phase >= 2 ? 'active' : ''} ${phase === 2 ? 'current' : ''}`}>
          <span className="uv-phase-dot">●</span>
          <span className="uv-phase-label">Ended</span>
        </div>
      </div>
      {phase < 2 && (
        <div className={`uv-phase-time ${isUrgent ? 'urgent' : ''}`}>
          {timeInfo.label}: {timeInfo.time}
        </div>
      )}
    </div>
  )
}
