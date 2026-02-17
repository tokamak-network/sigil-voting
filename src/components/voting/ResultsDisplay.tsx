/**
 * ResultsDisplay - Vote Tally Results UI
 *
 * Reads finalized vote counts from the Tally contract
 * and displays them with visual bar chart and percentages.
 */

import { useReadContract } from 'wagmi';
import { TALLY_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface ResultsDisplayProps {
  tallyAddress: `0x${string}`;
}

export function ResultsDisplay({ tallyAddress }: ResultsDisplayProps) {
  const { t } = useTranslation();

  const { data: forVotes } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'forVotes',
    query: { refetchInterval: 10000 },
  });

  const { data: againstVotes } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'againstVotes',
    query: { refetchInterval: 10000 },
  });

  const { data: totalVoters } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'totalVoters',
    query: { refetchInterval: 10000 },
  });

  const forNum = Number(forVotes || 0n);
  const againstNum = Number(againstVotes || 0n);
  const totalNum = forNum + againstNum;
  const votersNum = Number(totalVoters || 0n);

  const forPct = totalNum > 0 ? Math.round((forNum / totalNum) * 100) : 0;
  const againstPct = totalNum > 0 ? 100 - forPct : 0;
  const hasVotes = totalNum > 0;
  const passed = hasVotes && forNum > againstNum;

  return (
    <div role="region" aria-label={t.results.title}>
      <div className="flex items-start justify-between mb-6">
        <h3 className="font-display text-xl font-black uppercase">{t.results.title}</h3>
        {hasVotes ? (
          <div
            className={`px-4 py-2 font-display font-black text-sm uppercase ${
              passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {passed ? t.results.passed : t.results.rejected}
          </div>
        ) : (
          <div className="px-4 py-2 font-display font-black text-sm uppercase bg-slate-300 text-white">
            No votes
          </div>
        )}
      </div>

      {/* FOR bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-500">thumb_up</span>
            <span className="text-sm font-bold uppercase text-emerald-500">For</span>
            <span className="text-2xl font-display font-black">{forPct}%</span>
          </div>
          <span className="text-sm font-mono text-slate-500">{forNum} credits</span>
        </div>
        <div className="w-full h-4 bg-slate-100">
          <div
            className="h-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${forPct}%` }}
            role="progressbar"
            aria-valuenow={forPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* AGAINST bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-red-500">thumb_down</span>
            <span className="text-sm font-bold uppercase">Against</span>
            <span className="text-2xl font-display font-black">{againstPct}%</span>
          </div>
          <span className="text-sm font-mono text-slate-500">{againstNum} credits</span>
        </div>
        <div className="w-full h-4 bg-slate-100">
          <div
            className="h-full bg-red-500 transition-all duration-700"
            style={{ width: `${againstPct}%` }}
            role="progressbar"
            aria-valuenow={againstPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="border-t-2 border-slate-200 pt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{t.results.totalVoters}: {votersNum}</span>
        <span>{t.results.totalVotes}: {totalNum}</span>
      </div>

      <div className="mt-4 flex items-center gap-2 text-green-600">
        <span className="material-symbols-outlined text-sm">verified</span>
        <span className="text-xs font-bold uppercase">{t.results.verified}</span>
      </div>
    </div>
  );
}
