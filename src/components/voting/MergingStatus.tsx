/**
 * MergingStatus - AccQueue Merge Progress UI
 *
 * Displayed during the Merging phase (after voting ends, before processing).
 * Shows state AQ and message AQ merge progress with auto-refresh.
 * Includes elapsed timer and stuck detection.
 */

import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { POLL_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface MergingStatusProps {
  pollAddress?: `0x${string}`;
  votingEndTime?: number; // Unix seconds — when voting ended
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function MergingStatus({ pollAddress, votingEndTime }: MergingStatusProps) {
  const address = pollAddress;
  const hasValidAddress = !!address && address !== ZERO_ADDRESS;
  const { t } = useTranslation();

  // Use on-chain votingEndTime as base (survives page refresh), fallback to mount time
  const [baseTime] = useState(() => votingEndTime ? votingEndTime * 1000 : Date.now());
  const [elapsed, setElapsed] = useState(() => Date.now() - baseTime);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - baseTime), 1000);
    return () => clearInterval(interval);
  }, [baseTime]);

  const isStuck = elapsed > STUCK_THRESHOLD_MS;

  const { data: stateAqMerged, isPending: stateLoading } = useReadContract({
    address: address!,
    abi: POLL_ABI,
    functionName: 'stateAqMerged',
    query: { enabled: hasValidAddress, refetchInterval: 10000 },
  });

  const { data: messageAqMerged, isPending: msgLoading } = useReadContract({
    address: address!,
    abi: POLL_ABI,
    functionName: 'messageAqMerged',
    query: { enabled: hasValidAddress, refetchInterval: 10000 },
  });

  const isLoading = stateLoading || msgLoading;
  const stateComplete = stateAqMerged === true;
  const messageComplete = messageAqMerged === true;
  const allMerged = stateComplete && messageComplete;

  const estimateMs = 2 * 60 * 1000;
  const remaining = Math.max(0, estimateMs - elapsed);
  const overdue = elapsed > estimateMs;
  const progress = Math.min(100, (elapsed / estimateMs) * 100);

  return (
    <div role="status" aria-live="polite">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="material-symbols-outlined text-primary text-2xl animate-spin" aria-hidden="true">progress_activity</span>
        <h3 className="font-display text-2xl font-black uppercase tracking-tight">
          {t.merging.title}
        </h3>
      </div>
      <p className="text-sm text-slate-500 mb-6">{t.merging.desc}</p>

      {/* Timer */}
      <div className="mb-6 p-5 border-2 border-black bg-white">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">{t.merging.estimate}</span>
          <span className={`font-display text-3xl font-black tracking-tighter ${overdue ? 'text-amber-500' : 'text-primary'}`}>
            {overdue ? formatElapsed(elapsed) : formatElapsed(remaining)}
          </span>
        </div>
        <div className="w-full h-2 bg-black/10 border border-black/20">
          <div
            className={`h-full transition-all duration-1000 ${overdue ? 'bg-amber-400' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="font-mono text-xs font-bold text-slate-400">{t.merging.elapsed}: {formatElapsed(elapsed)}</span>
          <span className="font-mono text-xs font-bold text-slate-400">~2:00</span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <div className={`p-4 border-2 border-black ${stateComplete ? 'bg-green-50' : 'bg-white'}`}>
          <div className="flex items-center gap-3">
            <span className={`w-8 h-8 flex items-center justify-center border-2 border-black font-mono text-xs font-black ${stateComplete ? 'bg-green-500 text-white' : 'bg-primary text-white'}`} aria-hidden="true">
              {stateComplete ? <span className="material-symbols-outlined text-sm">check</span> : '01'}
            </span>
            <span className="text-sm font-bold flex-1 uppercase tracking-wide">{t.merging.stateQueue}</span>
            <span className={`font-mono text-xs font-bold uppercase tracking-widest ${stateComplete ? 'text-green-600' : 'text-slate-400'}`}>
              {isLoading ? '...' : stateComplete ? t.merging.merged : t.merging.pending}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2 ml-11">{t.merging.stateQueueDesc}</p>
        </div>

        <div className={`p-4 border-2 border-black ${messageComplete ? 'bg-green-50' : 'bg-white'}`}>
          <div className="flex items-center gap-3">
            <span className={`w-8 h-8 flex items-center justify-center border-2 border-black font-mono text-xs font-black ${messageComplete ? 'bg-green-500 text-white' : stateComplete ? 'bg-primary text-white' : 'bg-white text-slate-400'}`} aria-hidden="true">
              {messageComplete ? <span className="material-symbols-outlined text-sm">check</span> : '02'}
            </span>
            <span className="text-sm font-bold flex-1 uppercase tracking-wide">{t.merging.messageQueue}</span>
            <span className={`font-mono text-xs font-bold uppercase tracking-widest ${messageComplete ? 'text-green-600' : 'text-slate-400'}`}>
              {isLoading ? '...' : messageComplete ? t.merging.merged : t.merging.pending}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2 ml-11">{t.merging.messageQueueDesc}</p>
        </div>
      </div>

      {/* Timeline note */}
      <div className="mt-4 p-4 border-2 border-black bg-primary/5 flex items-start gap-3">
        <span className="material-symbols-outlined text-primary text-sm mt-0.5" aria-hidden="true">schedule</span>
        <p className="text-xs text-slate-600 leading-relaxed">{t.merging.timelineNote}</p>
      </div>

      {allMerged && (
        <div className="mt-4 p-4 border-2 border-black bg-green-50 flex items-center gap-3">
          <span className="material-symbols-outlined text-green-600" aria-hidden="true">check_circle</span>
          <p className="text-sm font-bold text-green-700 uppercase tracking-wide">{t.merging.allMerged}</p>
        </div>
      )}

      {isStuck && !allMerged && (
        <div className="mt-4 p-4 border-2 border-black bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">warning</span>
            <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">{t.merging.stuck}</span>
          </div>
          <p className="text-xs text-amber-600">{t.merging.stuckDesc}</p>
        </div>
      )}
    </div>
  );
}
