/**
 * ResultsDisplay - Completed Results (Page 2 mockup)
 *
 * Full-width voting breakdown with tall bars, ZK verification bar,
 * and Final Tally Detailed section matching the Page 2 design.
 */

import { useReadContract } from 'wagmi';
import { TALLY_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface ResultsDisplayProps {
  tallyAddress: `0x${string}`;
  pollAddress?: `0x${string}`;
}

export function ResultsDisplay({ tallyAddress, pollAddress }: ResultsDisplayProps) {
  const { t } = useTranslation();

  const { data: forVotes, isLoading: loadingFor, isError: errorFor } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'forVotes',
  });

  const { data: againstVotes, isLoading: loadingAgainst, isError: errorAgainst } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'againstVotes',
  });

  const { data: totalVoters, isLoading: loadingVoters } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'totalVoters',
  });

  const isLoading = loadingFor || loadingAgainst || loadingVoters;
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
      </div>
    );
  }

  const forNum = Number(forVotes || 0n);
  const againstNum = Number(againstVotes || 0n);
  const totalNum = forNum + againstNum;
  const votersNum = Number(totalVoters || 0n);

  const forPct = totalNum > 0 ? Math.round((forNum / totalNum) * 100) : 0;
  const againstPct = totalNum > 0 ? 100 - forPct : 0;
  const hasVotes = totalNum > 0;

  const explorerAddr = pollAddress || tallyAddress;

  return (
    <div className="space-y-6" role="region" aria-label={t.results.title}>
      {/* Voting Breakdown Card */}
      <div className="border-2 border-black bg-white p-8">
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-xl font-display font-bold uppercase italic">{t.completedResults.votingBreakdown}</h2>
          <div className="text-right">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.proposalDetail.totalParticipants}</span>
            <span className="text-3xl font-display font-bold">{votersNum}</span>
          </div>
        </div>

        <div className="space-y-12">
          {/* FOR bar */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">thumb_up</span>
                <span className="font-bold uppercase tracking-widest text-sm">{t.results.forLabel}</span>
              </div>
              <span className="text-3xl font-mono font-bold text-primary">{forPct}%</span>
            </div>
            <div className="w-full h-12 bg-slate-100 border-2 border-black">
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
                <span className="material-symbols-outlined">thumb_down</span>
                <span className="font-bold uppercase tracking-widest text-sm">{t.results.againstLabel}</span>
              </div>
              <span className="text-3xl font-mono font-bold">{againstPct}%</span>
            </div>
            <div className="w-full h-12 bg-slate-100 border-2 border-black">
              <div
                className="h-full bg-black transition-all duration-700"
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
        </div>

        {/* Final Tally Detailed */}
        <div className="mt-12 pt-8 border-t-2 border-black">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-4">{t.completedResults.finalTally}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t.completedResults.uniqueAddresses}</span>
              <span className="font-mono font-bold">{votersNum.toLocaleString()}</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t.completedResults.quadraticMagnitude}</span>
              <span className="font-mono font-bold">{totalNum.toLocaleString()} {hasVotes ? t.results.creditsUnit : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ZK Verification Bar */}
      <div className="bg-black text-white p-6 border-2 border-black flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-white/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-2xl">verified_user</span>
          </div>
          <div>
            <h4 className="font-bold uppercase italic text-sm">{t.completedResults.zkVerified}</h4>
            <p className="text-[10px] text-slate-400 font-mono">
              TX: {tallyAddress.slice(0, 6)}...{tallyAddress.slice(-4)}
            </p>
          </div>
        </div>
        <a
          href={`https://sepolia.etherscan.io/address/${explorerAddr}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white text-black px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-colors flex items-center gap-2"
        >
          {t.completedResults.viewOnExplorer}
          <span className="material-symbols-outlined text-sm">open_in_new</span>
        </a>
      </div>
    </div>
  );
}
