/**
 * ResultsDisplay - Completed Results (Page 2 mockup)
 *
 * Full-width voting breakdown with tall bars, ZK verification bar,
 * and Final Tally Detailed section matching the Page 2 design.
 */

import { useReadContract } from 'wagmi';
import { TALLY_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';
import { ExecutionPanel } from '../governance/ExecutionPanel';

interface ResultsDisplayProps {
  tallyAddress: `0x${string}`;
  pollAddress?: `0x${string}`;
  pollId?: number;
}

export function ResultsDisplay({ tallyAddress, pollAddress, pollId }: ResultsDisplayProps) {
  const { t } = useTranslation();

  const { data: tallyVerified, isLoading: loadingVerified, dataUpdatedAt: verifiedUpdatedAt } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
    query: { refetchInterval: 5000, staleTime: 0 },
  });

  const settled = tallyVerified === true;
  const isRefreshing = !settled && verifiedUpdatedAt > 0;

  const { data: forVotes, isLoading: loadingFor, isError: errorFor } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'forVotes',
    query: { refetchInterval: settled ? false : 5000, staleTime: 0 },
  });

  const { data: againstVotes, isLoading: loadingAgainst, isError: errorAgainst } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'againstVotes',
    query: { refetchInterval: settled ? false : 5000, staleTime: 0 },
  });

  const { data: totalVoters, isLoading: loadingVoters } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'totalVoters',
    query: { refetchInterval: settled ? false : 5000, staleTime: 0 },
  });

  const isLoading = loadingFor || loadingAgainst || loadingVoters || loadingVerified;
  const hasError = errorFor || errorAgainst;

  if (isLoading) {
    return (
      <div className="border-2 border-black bg-white p-12 flex flex-col items-center justify-center gap-4">
        <span className="spinner" aria-hidden="true" />
        <span className="text-sm font-mono text-slate-500 uppercase tracking-wider">{t.maci.waiting.processing}</span>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="border-2 border-red-300 bg-red-50 p-8 flex flex-col items-center gap-3">
        <span className="material-symbols-outlined text-4xl text-red-400">error</span>
        <p className="text-sm font-bold text-red-700 uppercase">{t.results.title}</p>
        <p className="text-xs text-red-600">{t.voteForm.error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 border-2 border-red-400 text-red-700 text-xs font-bold uppercase hover:bg-red-100 transition-colors"
        >
          {t.results.retry}
        </button>
      </div>
    );
  }

  if (tallyVerified !== true) {
    return (
      <div className="border-2 border-black bg-white p-12 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-5xl text-slate-300">hourglass_top</span>
          {isRefreshing && (
            <span className="w-3 h-3 bg-primary rounded-full animate-pulse" title="Auto-refreshing" aria-label="Auto-refreshing results"></span>
          )}
        </div>
        <p className="text-lg font-display font-bold uppercase text-slate-500">{t.processing.inProgress}</p>
        <p className="text-sm text-slate-400">{t.processing.desc}</p>
      </div>
    );
  }

  const forNum = Number(forVotes || 0n);
  const againstNum = Number(againstVotes || 0n);
  const totalNum = forNum + againstNum;
  const votersNum = Number(totalVoters || 0n);

  const forPct = totalNum > 0 ? Math.round((forNum / totalNum) * 100) : 0;
  const againstPct = totalNum > 0 ? 100 - forPct : 0;

  const explorerAddr = pollAddress || tallyAddress;

  if (totalNum === 0) {
    // If totalVoters > 0 but for+against = 0, votes were verified but all invalid
    if (votersNum > 0) {
      return (
        <div className="border-2 border-black bg-white p-12 flex flex-col items-center justify-center gap-4">
          <span className="material-symbols-outlined text-5xl text-amber-400">verified</span>
          <p className="text-lg font-display font-bold uppercase text-slate-700">{t.results.verified}</p>
          <p className="text-sm text-slate-500">{t.results.allInvalid}</p>
        </div>
      );
    }
    return (
      <div className="border-2 border-black bg-white p-12 flex flex-col items-center justify-center gap-4">
        <span className="material-symbols-outlined text-5xl text-slate-300">how_to_vote</span>
        <p className="text-lg font-display font-bold uppercase text-slate-500">{t.results.noVotesYet}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" role="region" aria-label={t.results.title}>
      {/* Voting Breakdown Card */}
      <div className="border-2 border-black bg-white p-4 sm:p-6 md:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-0 mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-display font-bold uppercase italic">{t.completedResults.votingBreakdown}</h2>
          <div className="text-left sm:text-right">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.proposalDetail.totalParticipants}</span>
            <span className="text-2xl sm:text-3xl font-display font-bold">{votersNum}</span>
          </div>
        </div>

        <div className="space-y-8 sm:space-y-12">
          {/* FOR bar */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg sm:text-xl">thumb_up</span>
                <span className="font-bold uppercase tracking-widest text-xs sm:text-sm">{t.results.forLabel}</span>
              </div>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-primary">{forPct}%</span>
            </div>
            <div className="w-full h-8 sm:h-12 bg-slate-100 border-2 border-black overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-700"
                style={{ width: `${forPct}%` }}
                role="progressbar"
                aria-valuenow={forPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <div className="mt-2 text-[10px] font-mono font-bold text-slate-500 text-right uppercase">
              {forNum.toLocaleString()} {t.completedResults.quadraticCredits}
            </div>
          </div>

          {/* AGAINST bar */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="material-symbols-outlined text-lg sm:text-xl">thumb_down</span>
                <span className="font-bold uppercase tracking-widest text-xs sm:text-sm">{t.results.againstLabel}</span>
              </div>
              <span className="text-2xl sm:text-3xl font-mono font-bold">{againstPct}%</span>
            </div>
            <div className="w-full h-8 sm:h-12 bg-slate-100 border-2 border-black overflow-hidden">
              <div
                className="h-full bg-slate-700 transition-all duration-700"
                style={{ width: `${againstPct}%` }}
                role="progressbar"
                aria-valuenow={againstPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <div className="mt-2 text-[10px] font-mono font-bold text-slate-500 text-right uppercase">
              {againstNum.toLocaleString()} {t.completedResults.quadraticCredits}
            </div>
          </div>

          {/* Abstain hidden by design */}
        </div>

      </div>

      {/* ZK Verification Bar */}
      <div className="bg-black text-white p-4 sm:p-6 border-2 border-black flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 border border-white/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-xl sm:text-2xl">verified_user</span>
          </div>
          <div>
            <h4 className="font-bold uppercase italic text-xs sm:text-sm">{t.completedResults.zkVerified}</h4>
            <p className="text-[10px] text-slate-400 font-mono">
              Ethereum Sepolia
            </p>
          </div>
        </div>
        <a
          href={`https://sepolia.etherscan.io/address/${explorerAddr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white text-black px-4 sm:px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          {t.completedResults.viewOnExplorer}
          <span className="material-symbols-outlined text-sm">open_in_new</span>
        </a>
      </div>

      {/* Execution Panel */}
      {pollId !== undefined && <ExecutionPanel pollId={pollId} />}
    </div>
  );
}
