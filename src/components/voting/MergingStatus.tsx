/**
 * MergingStatus - AccQueue Merge Progress UI
 *
 * Displayed during the Merging phase (after voting ends, before processing).
 * Shows state AQ and message AQ merge progress with auto-refresh.
 * Includes elapsed timer and stuck detection.
 */

import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface MergingStatusProps {
  pollAddress?: `0x${string}`;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function MergingStatus({ pollAddress }: MergingStatusProps) {
  const address = pollAddress || POLL_V2_ADDRESS;
  const hasValidAddress = address !== ZERO_ADDRESS;
  const { t } = useTranslation();

  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const isStuck = elapsed > STUCK_THRESHOLD_MS;

  const { data: stateAqMerged, isPending: stateLoading } = useReadContract({
    address,
    abi: POLL_ABI,
    functionName: 'stateAqMerged',
    query: { enabled: hasValidAddress, refetchInterval: 10000 },
  });

  const { data: messageAqMerged, isPending: msgLoading } = useReadContract({
    address,
    abi: POLL_ABI,
    functionName: 'messageAqMerged',
    query: { enabled: hasValidAddress, refetchInterval: 10000 },
  });

  const isLoading = stateLoading || msgLoading;
  const stateComplete = stateAqMerged === true;
  const messageComplete = messageAqMerged === true;
  const allMerged = stateComplete && messageComplete;

  return (
    <div role="status" aria-live="polite">
      <h3 className="font-display text-xl font-black uppercase tracking-tight mb-2">
        {t.merging.title}
      </h3>
      <p className="text-sm text-slate-500 mb-4">{t.merging.desc}</p>

      {/* Countdown timer */}
      {(() => {
        const estimateMs = 2 * 60 * 1000; // 2 minutes estimate
        const remaining = Math.max(0, estimateMs - elapsed);
        const overdue = elapsed > estimateMs;
        return (
          <div className="mb-4 p-4 bg-slate-50 border-2 border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary animate-spin" aria-hidden="true">progress_activity</span>
                <span className="text-sm font-bold">{t.merging.estimate}</span>
              </div>
              <span className={`text-2xl font-mono font-black ${overdue ? 'text-amber-500' : 'text-primary'}`}>
                {overdue ? t.merging.almostDone || '거의 완료' : formatElapsed(remaining)}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 bg-slate-200 overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${overdue ? 'bg-amber-400' : 'bg-primary'}`}
                style={{ width: `${Math.min(100, (elapsed / estimateMs) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs font-mono text-slate-400">{t.merging.elapsed}: {formatElapsed(elapsed)}</span>
              <span className="text-xs font-mono text-slate-400">~2:00</span>
            </div>
          </div>
        );
      })()}

      <div className="space-y-3">
        <div
          className={`p-4 border-2 ${
            stateComplete ? 'border-green-500 bg-green-50' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`material-symbols-outlined ${
                stateComplete ? 'text-green-600' : 'text-slate-400'
              }`}
              aria-hidden="true"
            >
              {isLoading ? 'pending' : stateComplete ? 'check_circle' : 'circle'}
            </span>
            <span className="text-sm font-bold flex-1">{t.merging.stateQueue}</span>
            <span
              className={`text-xs font-mono font-bold uppercase ${
                stateComplete ? 'text-green-600' : 'text-slate-400'
              }`}
            >
              {isLoading ? '...' : stateComplete ? t.merging.merged : t.merging.pending}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-9">{t.merging.stateQueueDesc}</p>
        </div>

        <div
          className={`p-4 border-2 ${
            messageComplete ? 'border-green-500 bg-green-50' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`material-symbols-outlined ${
                messageComplete ? 'text-green-600' : 'text-slate-400'
              }`}
              aria-hidden="true"
            >
              {isLoading ? 'pending' : messageComplete ? 'check_circle' : 'circle'}
            </span>
            <span className="text-sm font-bold flex-1">{t.merging.messageQueue}</span>
            <span
              className={`text-xs font-mono font-bold uppercase ${
                messageComplete ? 'text-green-600' : 'text-slate-400'
              }`}
            >
              {isLoading ? '...' : messageComplete ? t.merging.merged : t.merging.pending}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-9">{t.merging.messageQueueDesc}</p>
        </div>
      </div>

      {/* Timeline note */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 flex items-start gap-2">
        <span className="material-symbols-outlined text-blue-500 text-sm mt-0.5" aria-hidden="true">schedule</span>
        <p className="text-xs text-blue-700 leading-relaxed">{t.merging.timelineNote}</p>
      </div>

      {allMerged && (
        <p className="mt-4 text-sm font-bold text-green-600">{t.merging.allMerged}</p>
      )}

      {isStuck && !allMerged && (
        <div className="mt-4 p-4 border-2 border-amber-400 bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">warning</span>
            <span className="text-sm font-bold text-amber-700">{t.merging.stuck}</span>
          </div>
          <p className="text-xs text-amber-600">{t.merging.stuckDesc}</p>
        </div>
      )}
    </div>
  );
}
