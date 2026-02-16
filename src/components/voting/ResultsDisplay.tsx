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
  const passed = forNum > againstNum;

  return (
    <div className="results-display" role="region" aria-label={t.results.title}>
      <h3>{t.results.title}</h3>
      <p className="results-desc">{t.results.desc}</p>

      <div className={`results-verdict ${passed ? 'passed' : 'rejected'}`}>
        <span className="verdict-icon">{passed ? '\u2713' : '\u2717'}</span>
        <span className="verdict-text">
          {passed ? t.results.passed : t.results.rejected}
        </span>
      </div>

      <div className="results-bars">
        <div className="result-row">
          <div className="result-label">
            <span className="result-choice for">{t.voteForm.for}</span>
            <span className="result-count">{forNum}</span>
          </div>
          <div className="result-bar-bg">
            <div
              className="result-bar for"
              style={{ width: `${forPct}%` }}
              role="progressbar"
              aria-valuenow={forPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="result-pct">{forPct}%</span>
        </div>

        <div className="result-row">
          <div className="result-label">
            <span className="result-choice against">{t.voteForm.against}</span>
            <span className="result-count">{againstNum}</span>
          </div>
          <div className="result-bar-bg">
            <div
              className="result-bar against"
              style={{ width: `${againstPct}%` }}
              role="progressbar"
              aria-valuenow={againstPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="result-pct">{againstPct}%</span>
        </div>
      </div>

      <div className="results-meta">
        <span>{t.results.totalVoters}: {votersNum}</span>
        <span>{t.results.totalVotes}: {totalNum}</span>
      </div>

      <p className="results-verified">
        <span className="verified-icon">{'\u2713'}</span> {t.results.verified}
      </p>
    </div>
  );
}
