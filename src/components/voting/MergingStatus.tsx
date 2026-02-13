/**
 * MergingStatus - AccQueue Merge Progress UI
 *
 * Displayed during the Merging phase (after voting ends, before processing).
 * Shows state AQ and message AQ merge progress.
 */

import { useReadContract } from 'wagmi';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';

interface MergingStatusProps {
  pollAddress?: `0x${string}`;
}

export function MergingStatus({ pollAddress }: MergingStatusProps) {
  const address = pollAddress || POLL_V2_ADDRESS;

  const { data: stateAqMerged } = useReadContract({
    address,
    abi: POLL_ABI,
    functionName: 'stateAqMerged',
  });

  const { data: messageAqMerged } = useReadContract({
    address,
    abi: POLL_ABI,
    functionName: 'messageAqMerged',
  });

  const stateComplete = stateAqMerged === true;
  const messageComplete = messageAqMerged === true;
  const allMerged = stateComplete && messageComplete;

  return (
    <div className="merging-status">
      <h3>AccQueue Merging</h3>
      <p className="text-sm text-gray-500">
        Voting has ended. The coordinator is merging on-chain data structures
        before processing votes.
      </p>

      <div className="merge-progress">
        <div className={`merge-item ${stateComplete ? 'complete' : 'pending'}`}>
          <span className="status-icon">{stateComplete ? '\u2713' : '\u25CB'}</span>
          <span>State AccQueue</span>
          <span className="status-text">
            {stateComplete ? 'Merged' : 'Pending...'}
          </span>
        </div>

        <div className={`merge-item ${messageComplete ? 'complete' : 'pending'}`}>
          <span className="status-icon">{messageComplete ? '\u2713' : '\u25CB'}</span>
          <span>Message AccQueue</span>
          <span className="status-text">
            {messageComplete ? 'Merged' : 'Pending...'}
          </span>
        </div>
      </div>

      {allMerged && (
        <p className="all-merged">
          All AccQueues merged. Coordinator can now begin processing votes.
        </p>
      )}
    </div>
  );
}
