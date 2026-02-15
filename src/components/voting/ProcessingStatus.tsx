/**
 * ProcessingStatus - Vote Processing Progress UI
 *
 * Displayed during the Processing phase.
 * The coordinator processes messages off-chain and submits proofs.
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

  // Don't query zero addresses — contracts are deployed dynamically
  const hasValidAddresses = mpAddress !== ZERO_ADDRESS && tAddress !== ZERO_ADDRESS;

  const { data: processingComplete } = useReadContract({
    address: mpAddress,
    abi: MESSAGE_PROCESSOR_ABI,
    functionName: 'processingComplete',
    query: { enabled: hasValidAddresses },
  });

  const { data: tallyVerified } = useReadContract({
    address: tAddress,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
    query: { enabled: hasValidAddresses },
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
