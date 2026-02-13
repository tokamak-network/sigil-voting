/**
 * ProcessingStatus - Vote Processing Progress UI
 *
 * Displayed during the Processing phase.
 * The coordinator processes messages off-chain and submits proofs.
 */

import { useReadContract } from 'wagmi';
import { MESSAGE_PROCESSOR_ABI, MESSAGE_PROCESSOR_ADDRESS, TALLY_ABI, TALLY_V2_ADDRESS } from '../../contractV2';

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
      <h3>Vote Processing</h3>
      <p className="text-sm text-gray-500">
        The coordinator is processing encrypted votes and generating ZK proofs.
        This may take several minutes.
      </p>

      <div className="processing-steps">
        <div className={`step ${!isProcessing ? 'complete' : 'active'}`}>
          <span className="step-num">1</span>
          <span>Message Processing</span>
          <span className="status-text">
            {isProcessing ? 'In progress...' : 'Complete'}
          </span>
        </div>

        <div className={`step ${isFinalized ? 'complete' : isTallying ? 'active' : 'pending'}`}>
          <span className="step-num">2</span>
          <span>Vote Tallying</span>
          <span className="status-text">
            {isFinalized ? 'Complete' : isTallying ? 'In progress...' : 'Waiting'}
          </span>
        </div>

        <div className={`step ${isFinalized ? 'complete' : 'pending'}`}>
          <span className="step-num">3</span>
          <span>Results Published</span>
          <span className="status-text">
            {isFinalized ? 'Verified on-chain' : 'Waiting'}
          </span>
        </div>
      </div>
    </div>
  );
}
