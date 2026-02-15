/**
 * MergingStatus - AccQueue Merge Progress UI
 *
 * Displayed during the Merging phase (after voting ends, before processing).
 * Shows state AQ and message AQ merge progress.
 */

import { useReadContract } from 'wagmi';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface MergingStatusProps {
  pollAddress?: `0x${string}`;
}

export function MergingStatus({ pollAddress }: MergingStatusProps) {
  const address = pollAddress || POLL_V2_ADDRESS;
  const { t } = useTranslation();

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
      <h3>{t.merging.title}</h3>
      <p className="text-sm text-gray-500">{t.merging.desc}</p>

      <div className="merge-progress">
        <div className={`merge-item ${stateComplete ? 'complete' : 'pending'}`}>
          <span className="status-icon">{stateComplete ? '\u2713' : '\u25CB'}</span>
          <span>{t.merging.stateQueue}</span>
          <span className="status-text">
            {stateComplete ? t.merging.merged : t.merging.pending}
          </span>
        </div>

        <div className={`merge-item ${messageComplete ? 'complete' : 'pending'}`}>
          <span className="status-icon">{messageComplete ? '\u2713' : '\u25CB'}</span>
          <span>{t.merging.messageQueue}</span>
          <span className="status-text">
            {messageComplete ? t.merging.merged : t.merging.pending}
          </span>
        </div>
      </div>

      {allMerged && <p className="all-merged">{t.merging.allMerged}</p>}
    </div>
  );
}
