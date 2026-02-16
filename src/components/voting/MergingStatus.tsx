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
    query: { refetchInterval: 5000 },
  });

  const { data: messageAqMerged, isPending: msgLoading } = useReadContract({
    address,
    abi: POLL_ABI,
    functionName: 'messageAqMerged',
    query: { refetchInterval: 5000 },
  });

  const isLoading = stateLoading || msgLoading;
  const stateComplete = stateAqMerged === true;
  const messageComplete = messageAqMerged === true;
  const allMerged = stateComplete && messageComplete;

  return (
    <div role="status" aria-live="polite">
      <h3 className="font-display text-xl font-black uppercase tracking-tight mb-2">
        {t.merging.title}
      </h3>
      <p className="text-sm text-slate-500 mb-6">{t.merging.desc}</p>

      <div className="space-y-3">
        <div
          className={`flex items-center gap-3 p-4 border-2 ${
            stateComplete ? 'border-green-500 bg-green-50' : 'border-slate-200'
          }`}
        >
          <span
            className={`material-symbols-outlined ${
              stateComplete ? 'text-green-600' : 'text-slate-400'
            }`}
            aria-hidden="true"
          >
            {isLoading ? 'pending' : stateComplete ? 'check_circle' : 'circle'}
          </span>
          <span className="text-sm font-bold flex-1">{t.merging.stateQueue}</span>
          <span
            className={`text-xs font-mono font-bold uppercase ${
              stateComplete ? 'text-green-600' : 'text-slate-400'
            }`}
          >
            {isLoading ? '...' : stateComplete ? t.merging.merged : t.merging.pending}
          </span>
        </div>

        <div
          className={`flex items-center gap-3 p-4 border-2 ${
            messageComplete ? 'border-green-500 bg-green-50' : 'border-slate-200'
          }`}
        >
          <span
            className={`material-symbols-outlined ${
              messageComplete ? 'text-green-600' : 'text-slate-400'
            }`}
            aria-hidden="true"
          >
            {isLoading ? 'pending' : messageComplete ? 'check_circle' : 'circle'}
          </span>
          <span className="text-sm font-bold flex-1">{t.merging.messageQueue}</span>
          <span
            className={`text-xs font-mono font-bold uppercase ${
              messageComplete ? 'text-green-600' : 'text-slate-400'
            }`}
          >
            {isLoading ? '...' : messageComplete ? t.merging.merged : t.merging.pending}
          </span>
        </div>
      </div>

      {allMerged && (
        <p className="mt-4 text-sm font-bold text-green-600">{t.merging.allMerged}</p>
      )}
    </div>
  );
}
