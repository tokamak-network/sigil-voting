import { useMemo } from 'react'

interface PhaseIndicatorProps {
  phase: 0 | 1 | 2
  endTime: Date
  revealEndTime: Date
}

function formatTimeRemaining(targetTime: Date): string {
  const now = new Date()
  const diff = targetTime.getTime() - now.getTime()

  if (diff <= 0) return '종료'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `${days}일 ${hours}시간`
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
}

export function PhaseIndicator({ phase, endTime, revealEndTime }: PhaseIndicatorProps) {
  const timeInfo = useMemo(() => {
    if (phase === 0) {
      return { label: '투표 마감', time: formatTimeRemaining(endTime) }
    } else if (phase === 1) {
      return { label: '공개 마감', time: formatTimeRemaining(revealEndTime) }
    }
    return { label: '종료', time: '' }
  }, [phase, endTime, revealEndTime])

  const isUrgent = useMemo(() => {
    const now = new Date()
    const targetTime = phase === 0 ? endTime : revealEndTime
    const diff = targetTime.getTime() - now.getTime()
    return diff > 0 && diff < 60 * 60 * 1000 // 1시간 미만
  }, [phase, endTime, revealEndTime])

  return (
    <div className="uv-phase-indicator">
      <div className="uv-phase-steps">
        <div className={`uv-phase-step ${phase >= 0 ? 'active' : ''} ${phase === 0 ? 'current' : ''}`}>
          <span className="uv-phase-dot">●</span>
          <span className="uv-phase-label">투표</span>
        </div>
        <div className="uv-phase-line" />
        <div className={`uv-phase-step ${phase >= 1 ? 'active' : ''} ${phase === 1 ? 'current' : ''}`}>
          <span className="uv-phase-dot">●</span>
          <span className="uv-phase-label">공개</span>
        </div>
        <div className="uv-phase-line" />
        <div className={`uv-phase-step ${phase >= 2 ? 'active' : ''} ${phase === 2 ? 'current' : ''}`}>
          <span className="uv-phase-dot">●</span>
          <span className="uv-phase-label">종료</span>
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
