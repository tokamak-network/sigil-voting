/**
 * ProcessingStatus - Vote Processing Progress UI
 *
 * Displayed during the Processing phase.
 * The coordinator processes messages off-chain and submits proofs.
 *
 * When MP/Tally addresses are available: shows live on-chain status.
 * When addresses are unknown: shows a friendly "coordinator is working" message.
 */

import { useReadContract } from 'wagmi';
import { MESSAGE_PROCESSOR_ABI, MESSAGE_PROCESSOR_ADDRESS, TALLY_ABI, TALLY_V2_ADDRESS } from '../../contractV2';
import { useTranslation } from '../../i18n';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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

  const hasValidAddresses = mpAddress !== ZERO_ADDRESS && tAddress !== ZERO_ADDRESS;

  const { data: processingComplete } = useReadContract({
    address: mpAddress,
    abi: MESSAGE_PROCESSOR_ABI,
    functionName: 'processingComplete',
    query: { enabled: hasValidAddresses, refetchInterval: 5000 },
  });

  const { data: tallyVerified } = useReadContract({
    address: tAddress,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
    query: { enabled: hasValidAddresses, refetchInterval: 5000 },
  });

  // If we don't have valid addresses, show a simplified waiting state
  if (!hasValidAddresses) {
    return (
      <div role="status" aria-live="polite">
        <h3 className="font-display text-xl font-black uppercase tracking-tight mb-2">
          {t.processing.title}
        </h3>
        <p className="text-sm text-slate-500 mb-6">{t.processing.desc}</p>

        <div className="space-y-3">
          <StepItem num={1} label={t.processing.step1} status="active" statusText={t.processing.inProgress} />
          <StepItem num={2} label={t.processing.step2} status="pending" statusText={t.processing.waiting} />
          <StepItem num={3} label={t.processing.step3} status="pending" statusText={t.processing.waiting} />
        </div>
      </div>
    );
  }

  const isProcessing = !processingComplete;
  const isTallying = processingComplete && !tallyVerified;
  const isFinalized = tallyVerified === true;

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
      <p className="text-sm text-slate-500 mb-6">{t.processing.desc}</p>

      <div className="space-y-3">
        <StepItem num={1} label={t.processing.step1} status={step1Status} statusText={step1Text} />
        <StepItem num={2} label={t.processing.step2} status={step2Status} statusText={step2Text} />
        <StepItem num={3} label={t.processing.step3} status={step3Status} statusText={step3Text} />
      </div>
    </div>
  );
}
