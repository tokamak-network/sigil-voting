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

      {/* Elapsed timer + estimate */}
      <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-slate-400 animate-spin" aria-hidden="true">progress_activity</span>
          <span className="text-xs font-mono text-slate-600">
            {t.merging.elapsed}: <strong>{formatElapsed(elapsed)}</strong>
          </span>
        </div>
        <span className="text-xs font-mono text-slate-400">{t.merging.estimate}</span>
      </div>

      <div className="space-y-3">
        <div
          className={`flex items-center gap-3 p-4 border-2 ${
            stateComplete ? 'border-green-500 bg-green-50' : 'border-slate-200'
          }`}
        >
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

        <div
          className={`flex items-center gap-3 p-4 border-2 ${
            messageComplete ? 'border-green-500 bg-green-50' : 'border-slate-200'
          }`}
        >
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
