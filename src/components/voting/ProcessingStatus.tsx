/**
 * ProcessingStatus - Vote Processing Progress UI
 *
 * Displayed during the Processing phase.
 * The coordinator processes messages off-chain and submits proofs.
 */

import { useReadContract } from 'wagmi';
import { MESSAGE_PROCESSOR_ABI, MESSAGE_PROCESSOR_ADDRESS, TALLY_ABI, TALLY_V2_ADDRESS } from '../../contractV2';
import { useTranslation } from '../../i18n';

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

  const { data: processingComplete } = useReadContract({
    address: mpAddress,
    abi: MESSAGE_PROCESSOR_ABI,
    functionName: 'processingComplete',
  });

  const { data: tallyVerified } = useReadContract({
    address: tAddress,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
  });

  const isProcessing = !processingComplete;
  const isTallying = processingComplete && !tallyVerified;
  const isFinalized = tallyVerified === true;

  return (
    <div className="processing-status">
      <h3>{t.processing.title}</h3>
      <p className="text-sm text-gray-500">{t.processing.desc}</p>

      <div className="processing-steps">
        <div className={`step ${!isProcessing ? 'complete' : 'active'}`}>
          <span className="step-num">1</span>
          <span>{t.processing.step1}</span>
          <span className="status-text">
            {isProcessing ? t.processing.inProgress : t.processing.complete}
          </span>
        </div>

        <div className={`step ${isFinalized ? 'complete' : isTallying ? 'active' : 'pending'}`}>
          <span className="step-num">2</span>
          <span>{t.processing.step2}</span>
          <span className="status-text">
            {isFinalized ? t.processing.complete : isTallying ? t.processing.inProgress : t.processing.waiting}
          </span>
        </div>

        <div className={`step ${isFinalized ? 'complete' : 'pending'}`}>
          <span className="step-num">3</span>
          <span>{t.processing.step3}</span>
          <span className="status-text">
            {isFinalized ? t.processing.verified : t.processing.waiting}
          </span>
        </div>
      </div>
    </div>
  );
}
