/**
 * MergingStatus - AccQueue Merge Progress UI
 *
 * Displayed during the Merging phase (after voting ends, before processing).
 * Shows state AQ and message AQ merge progress with auto-refresh.
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

  const { data: stateAqMerged, isPending: stateLoading } = useReadContract({
    address,
    abi: POLL_ABI,
    functionName: 'stateAqMerged',
    query: { refetchInterval: 15000 },
  });

  const { data: messageAqMerged, isPending: msgLoading } = useReadContract({
    address,
    abi: POLL_ABI,
    functionName: 'messageAqMerged',
    query: { refetchInterval: 15000 },
  });

  const isLoading = stateLoading || msgLoading;
  const stateComplete = stateAqMerged === true;
  const messageComplete = messageAqMerged === true;
  const allMerged = stateComplete && messageComplete;

  return (
    <div className="merging-status" role="status" aria-live="polite">
      <h3>{t.merging.title}</h3>
      <p className="text-sm text-gray-500">{t.merging.desc}</p>

      <div className="merge-progress">
        <div className={`merge-item ${stateComplete ? 'complete' : 'pending'}`}>
          <span className="status-icon" aria-hidden="true">
            {isLoading ? '' : stateComplete ? '\u2713' : '\u25CB'}
            {isLoading && <span className="spinner-inline" />}
          </span>
          <span>{t.merging.stateQueue}</span>
          <span className="status-text">
            {isLoading ? '...' : stateComplete ? t.merging.merged : t.merging.pending}
          </span>
        </div>

        <div className={`merge-item ${messageComplete ? 'complete' : 'pending'}`}>
          <span className="status-icon" aria-hidden="true">
            {isLoading ? '' : messageComplete ? '\u2713' : '\u25CB'}
            {isLoading && <span className="spinner-inline" />}
          </span>
          <span>{t.merging.messageQueue}</span>
          <span className="status-text">
            {isLoading ? '...' : messageComplete ? t.merging.merged : t.merging.pending}
          </span>
        </div>
      </div>

      {allMerged && <p className="all-merged">{t.merging.allMerged}</p>}
    </div>
  );
}
