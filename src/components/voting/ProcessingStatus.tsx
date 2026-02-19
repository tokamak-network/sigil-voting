/**
 * ProcessingStatus - Vote Processing Progress UI
 *
 * Displayed during the Processing phase.
 * The coordinator processes messages off-chain and submits proofs.
 * Includes elapsed timer and stuck detection.
 */

import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { MESSAGE_PROCESSOR_ABI, TALLY_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

interface ProcessingStatusProps {
  messageProcessorAddress?: `0x${string}`;
  tallyAddress?: `0x${string}`;
  votingEndTime?: number; // Unix seconds — when voting ended
}

type StepStatus = 'complete' | 'active' | 'pending';

function StepItem({
  num,
  label,
  status,
  statusText,
}: {
  num: number;
  label: string;
  status: StepStatus;
  statusText: React.ReactNode;
}) {
  const bgClass =
    status === 'complete' ? 'bg-green-50' : 'bg-white';

  const badgeClass =
    status === 'complete'
      ? 'bg-green-500 text-white'
      : status === 'active'
        ? 'bg-primary text-white'
        : 'bg-white text-slate-400';

  const statusColor =
    status === 'complete'
      ? 'text-green-600'
      : status === 'active'
        ? 'text-primary'
        : 'text-slate-400';

  return (
    <div className={`flex items-center gap-3 p-4 border-2 border-black ${bgClass}`}>
      <span
        className={`w-8 h-8 flex items-center justify-center border-2 border-black font-mono text-xs font-black ${badgeClass}`}
        aria-hidden="true"
      >
        {status === 'complete' ? <span className="material-symbols-outlined text-sm">check</span> : `0${num}`}
      </span>
      <span className="text-sm font-bold flex-1 uppercase tracking-wide">{label}</span>
      <span className={`font-mono text-xs font-bold uppercase tracking-widest ${statusColor}`}>
        {statusText}
      </span>
    </div>
  );
}

function TimerBlock({ elapsed, estimateMs, t }: { elapsed: number; estimateMs: number; t: any }) {
  const remaining = Math.max(0, estimateMs - elapsed);
  const overdue = elapsed > estimateMs;
  const progress = Math.min(100, (elapsed / estimateMs) * 100);
  const estimateLabel = `~${Math.floor(estimateMs / 60000)}:00`;

  return (
    <div className="mb-6 p-5 border-2 border-black bg-white">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-slate-500">{t.processing.estimate}</span>
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
        <span className="font-mono text-xs font-bold text-slate-400">{t.processing.elapsed}: {formatElapsed(elapsed)}</span>
        <span className="font-mono text-xs font-bold text-slate-400">{estimateLabel}</span>
      </div>
    </div>
  );
}

export function ProcessingStatus({
  messageProcessorAddress,
  tallyAddress,
  votingEndTime,
}: ProcessingStatusProps) {
  const mpAddress = messageProcessorAddress;
  const tAddress = tallyAddress;
  const { t } = useTranslation();

  // Use on-chain votingEndTime as base (survives page refresh), fallback to mount time
  const [baseTime] = useState(() => votingEndTime ? votingEndTime * 1000 : Date.now());
  const [elapsed, setElapsed] = useState(() => Date.now() - baseTime);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - baseTime), 1000);
    return () => clearInterval(interval);
  }, [baseTime]);

  const isStuck = elapsed > STUCK_THRESHOLD_MS;
  const hasValidAddresses = !!mpAddress && !!tAddress && mpAddress !== ZERO_ADDRESS && tAddress !== ZERO_ADDRESS;
  const estimateMs = 4 * 60 * 1000;

  const { data: processingComplete } = useReadContract({
    address: mpAddress!,
    abi: MESSAGE_PROCESSOR_ABI,
    functionName: 'processingComplete',
    query: { enabled: hasValidAddresses, refetchInterval: 10000 },
  });

  const { data: tallyVerified } = useReadContract({
    address: tAddress!,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
    query: { enabled: hasValidAddresses, refetchInterval: 10000 },
  });

  const isFinalized = tallyVerified === true;

  // Simplified waiting state when addresses not available
  if (!hasValidAddresses) {
    return (
      <div role="status" aria-live="polite">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-primary text-2xl animate-spin" aria-hidden="true">progress_activity</span>
          <h3 className="font-display text-2xl font-black uppercase tracking-tight">{t.processing.title}</h3>
        </div>
        <p className="text-sm text-slate-500 mb-6">{t.processing.desc}</p>

        <TimerBlock elapsed={elapsed} estimateMs={estimateMs} t={t} />

        <div className="space-y-3">
          <StepItem num={1} label={t.processing.step1} status="active" statusText={t.processing.inProgress} />
          <StepItem num={2} label={t.processing.step2} status="pending" statusText={t.processing.waiting} />
          <StepItem num={3} label={t.processing.step3} status="pending" statusText={t.processing.waiting} />
        </div>

        {isStuck && (
          <div className="mt-4 p-4 border-2 border-black bg-amber-50">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">warning</span>
              <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">{t.processing.stuck}</span>
            </div>
            <p className="text-xs text-amber-600">{t.processing.stuckDesc}</p>
          </div>
        )}
      </div>
    );
  }

  const isProcessing = !processingComplete;
  const isTallying = processingComplete && !tallyVerified;

  const step1Status: StepStatus = !isProcessing ? 'complete' : 'active';
  const step2Status: StepStatus = isFinalized ? 'complete' : isTallying ? 'active' : 'pending';
  const step3Status: StepStatus = isFinalized ? 'complete' : 'pending';

  const step1Text = isProcessing ? t.processing.inProgress : t.processing.complete;
  const step2Text = isFinalized
    ? t.processing.complete
    : isTallying
      ? t.processing.inProgress
      : t.processing.waiting;
  const step3Text = isFinalized ? t.processing.verified : t.processing.waiting;

  return (
    <div role="status" aria-live="polite">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        {isFinalized ? (
          <span className="material-symbols-outlined text-green-600 text-2xl" aria-hidden="true">check_circle</span>
        ) : (
          <span className="material-symbols-outlined text-primary text-2xl animate-spin" aria-hidden="true">progress_activity</span>
        )}
        <h3 className="font-display text-2xl font-black uppercase tracking-tight">{t.processing.title}</h3>
      </div>
      <p className="text-sm text-slate-500 mb-6">{t.processing.desc}</p>

      {/* Timer (hide when finalized) */}
      {!isFinalized && <TimerBlock elapsed={elapsed} estimateMs={estimateMs} t={t} />}

      {/* Steps */}
      <div className="space-y-3">
        <StepItem num={1} label={t.processing.step1} status={step1Status} statusText={step1Text} />
        <StepItem num={2} label={t.processing.step2} status={step2Status} statusText={step2Text} />
        <StepItem num={3} label={t.processing.step3} status={step3Status} statusText={step3Text} />
      </div>

      {/* Timeline note */}
      {!isFinalized && (
        <div className="mt-4 p-4 border-2 border-black bg-primary/5 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-sm mt-0.5" aria-hidden="true">schedule</span>
          <p className="text-xs text-slate-600 leading-relaxed">{t.processing.timelineNote}</p>
        </div>
      )}

      {isStuck && !isFinalized && (
        <div className="mt-4 p-4 border-2 border-black bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">warning</span>
            <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">{t.processing.stuck}</span>
          </div>
          <p className="text-xs text-amber-600">{t.processing.stuckDesc}</p>
        </div>
      )}
    </div>
  );
}
