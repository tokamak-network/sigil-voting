/**
 * ProcessingStatus - Vote Processing Progress UI
 *
 * Displayed during the Processing phase.
 * The coordinator processes messages off-chain and submits proofs.
 * Includes elapsed timer and stuck detection.
 */

import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { MESSAGE_PROCESSOR_ABI, MESSAGE_PROCESSOR_ADDRESS, TALLY_ABI, TALLY_V2_ADDRESS } from '../../contractV2';
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
  const borderClass =
    status === 'complete'
      ? 'border-green-500 bg-green-50'
      : status === 'active'
        ? 'border-primary bg-primary/5'
        : 'border-slate-200';

  const badgeClass =
    status === 'complete'
      ? 'border-green-500 bg-green-500 text-white'
      : status === 'active'
        ? 'border-primary bg-primary text-white'
        : 'border-slate-300 text-slate-400';

  const statusColor =
    status === 'complete'
      ? 'text-green-600'
      : status === 'active'
        ? 'text-primary'
        : 'text-slate-400';

  return (
    <div className={`flex items-center gap-3 p-4 border-2 ${borderClass}`}>
      <span
        className={`w-8 h-8 flex items-center justify-center text-sm font-black border-2 ${badgeClass}`}
        aria-hidden="true"
      >
        {num}
      </span>
      <span className="text-sm font-bold flex-1">{label}</span>
      <span className={`text-xs font-mono font-bold uppercase ${statusColor}`}>
        {statusText}
      </span>
    </div>
  );
}

export function ProcessingStatus({
  messageProcessorAddress,
  tallyAddress,
}: ProcessingStatusProps) {
  const mpAddress = messageProcessorAddress || MESSAGE_PROCESSOR_ADDRESS;
  const tAddress = tallyAddress || TALLY_V2_ADDRESS;
  const { t } = useTranslation();

  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const isStuck = elapsed > STUCK_THRESHOLD_MS;

  const hasValidAddresses = mpAddress !== ZERO_ADDRESS && tAddress !== ZERO_ADDRESS;

  const { data: processingComplete } = useReadContract({
    address: mpAddress,
    abi: MESSAGE_PROCESSOR_ABI,
    functionName: 'processingComplete',
    query: { enabled: hasValidAddresses, refetchInterval: 10000 },
  });

  const { data: tallyVerified } = useReadContract({
    address: tAddress,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
    query: { enabled: hasValidAddresses, refetchInterval: 10000 },
  });

  const isFinalized = tallyVerified === true;

  // If we don't have valid addresses, show a simplified waiting state
  if (!hasValidAddresses) {
    return (
      <div role="status" aria-live="polite">
        <h3 className="font-display text-xl font-black uppercase tracking-tight mb-2">
          {t.processing.title}
        </h3>
        <p className="text-sm text-slate-500 mb-4">{t.processing.desc}</p>

        <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-slate-400 animate-spin" aria-hidden="true">progress_activity</span>
            <span className="text-xs font-mono text-slate-600">
              {t.processing.elapsed}: <strong>{formatElapsed(elapsed)}</strong>
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">{t.processing.estimate}</span>
        </div>

        <div className="space-y-3">
          <StepItem num={1} label={t.processing.step1} status="active" statusText={t.processing.inProgress} />
          <StepItem num={2} label={t.processing.step2} status="pending" statusText={t.processing.waiting} />
          <StepItem num={3} label={t.processing.step3} status="pending" statusText={t.processing.waiting} />
        </div>

        {isStuck && (
          <div className="mt-4 p-4 border-2 border-amber-400 bg-amber-50">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">warning</span>
              <span className="text-sm font-bold text-amber-700">{t.processing.stuck}</span>
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
      <h3 className="font-display text-xl font-black uppercase tracking-tight mb-2">
        {t.processing.title}
      </h3>
      <p className="text-sm text-slate-500 mb-4">{t.processing.desc}</p>

      {/* Elapsed timer + estimate (hide when finalized) */}
      {!isFinalized && (
        <div className="flex items-center justify-between mb-4 p-3 bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-slate-400 animate-spin" aria-hidden="true">progress_activity</span>
            <span className="text-xs font-mono text-slate-600">
              {t.processing.elapsed}: <strong>{formatElapsed(elapsed)}</strong>
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">{t.processing.estimate}</span>
        </div>
      )}

      <div className="space-y-3">
        <StepItem num={1} label={t.processing.step1} status={step1Status} statusText={step1Text} />
        <StepItem num={2} label={t.processing.step2} status={step2Status} statusText={step2Text} />
        <StepItem num={3} label={t.processing.step3} status={step3Status} statusText={step3Text} />
      </div>

      {isStuck && !isFinalized && (
        <div className="mt-4 p-4 border-2 border-amber-400 bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">warning</span>
            <span className="text-sm font-bold text-amber-700">{t.processing.stuck}</span>
          </div>
          <p className="text-xs text-amber-600">{t.processing.stuckDesc}</p>
        </div>
      )}
    </div>
  );
}
