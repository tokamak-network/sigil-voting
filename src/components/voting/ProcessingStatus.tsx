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
      <div className="processing-status" role="status" aria-live="polite">
        <h3>{t.processing.title}</h3>
        <p className="text-sm text-gray-500">{t.processing.desc}</p>

        <div className="processing-steps">
          <div className="step active">
            <span className="step-num" aria-hidden="true">1</span>
            <span>{t.processing.step1}</span>
            <span className="status-text">
              <span className="spinner-inline" aria-hidden="true" /> {t.processing.inProgress}
            </span>
          </div>
          <div className="step pending">
            <span className="step-num" aria-hidden="true">2</span>
            <span>{t.processing.step2}</span>
            <span className="status-text">{t.processing.waiting}</span>
          </div>
          <div className="step pending">
            <span className="step-num" aria-hidden="true">3</span>
            <span>{t.processing.step3}</span>
            <span className="status-text">{t.processing.waiting}</span>
          </div>
        </div>
      </div>
    );
  }

  const isProcessing = !processingComplete;
  const isTallying = processingComplete && !tallyVerified;
  const isFinalized = tallyVerified === true;

  return (
    <div className="processing-status" role="status" aria-live="polite">
      <h3>{t.processing.title}</h3>
      <p className="text-sm text-gray-500">{t.processing.desc}</p>

      <div className="processing-steps">
        <div className={`step ${!isProcessing ? 'complete' : 'active'}`}>
          <span className="step-num" aria-hidden="true">1</span>
          <span>{t.processing.step1}</span>
          <span className="status-text">
            {isProcessing ? (
              <><span className="spinner-inline" aria-hidden="true" /> {t.processing.inProgress}</>
            ) : t.processing.complete}
          </span>
        </div>

        <div className={`step ${isFinalized ? 'complete' : isTallying ? 'active' : 'pending'}`}>
          <span className="step-num" aria-hidden="true">2</span>
          <span>{t.processing.step2}</span>
          <span className="status-text">
            {isFinalized ? t.processing.complete : isTallying ? (
              <><span className="spinner-inline" aria-hidden="true" /> {t.processing.inProgress}</>
            ) : t.processing.waiting}
          </span>
        </div>

        <div className={`step ${isFinalized ? 'complete' : 'pending'}`}>
          <span className="step-num" aria-hidden="true">3</span>
          <span>{t.processing.step3}</span>
          <span className="status-text">
            {isFinalized ? t.processing.verified : t.processing.waiting}
          </span>
        </div>
      </div>
    </div>
  );
}
