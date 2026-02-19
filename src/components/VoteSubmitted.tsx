/**
 * VoteSubmitted - Vote submission confirmation page (Page 4)
 *
 * Displays a receipt-style confirmation after a successful vote,
 * including the choice, voting stats, transaction hash, and
 * privacy badges (MACI Shield + ZK-Proof).
 */

import { useTranslation } from '../i18n'

interface VoteSubmittedProps {
  pollId: number
  pollTitle: string
  choice: number // 0=against, 1=for
  weight: number
  cost: number
  txHash: string
  onBackToList: () => void
}

export function VoteSubmitted({
  pollId,
  pollTitle,
  choice,
  weight,
  cost,
  txHash,
  onBackToList,
}: VoteSubmittedProps) {
  const { t } = useTranslation()
  const hasTxHash = txHash && txHash.length >= 10
  const shortHash = hasTxHash
    ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}`
    : ''

  const explorerUrl = hasTxHash ? `https://sepolia.etherscan.io/tx/${txHash}` : ''

  const choiceLabel = choice === 1 ? t.voteForm.for : t.voteForm.against
  const choiceIcon = choice === 1 ? 'thumb_up' : 'thumb_down'

  return (
    <div className="w-full min-h-[80vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl flex flex-col items-center gap-10">

        {/* Checkmark Icon */}
        <div className="w-20 h-20 bg-primary text-white technical-border flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl">check_circle</span>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-display font-black uppercase italic tracking-tight text-center">
          {t.voteSubmittedPage.title}
        </h1>

        {/* Transaction Hash */}
        {hasTxHash && (
          <p className="font-mono text-sm text-slate-500 text-center break-all uppercase tracking-widest">
            {t.voteSubmittedPage.txHash}: {shortHash}
          </p>
        )}

        {/* Receipt Card */}
        <div className="technical-border bg-white p-8 w-full relative overflow-hidden">
          {/* Receipt ID Badge */}
          <div className="absolute top-0 right-0 p-4 border-l-2 border-b-2 border-black bg-slate-50">
            <span className="font-mono text-xs font-bold">RECEIPT #{pollId + 1}-ZK</span>
          </div>

          {/* Proposal Title */}
          <div className="border-l-4 border-black pl-4 mb-8 mt-2">
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">{t.voteSubmittedPage.proposal}</p>
            <p className="text-lg font-display font-bold leading-snug">{pollTitle}</p>
          </div>

          {/* My Choice + Voting Stats: side-by-side gray boxes */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-50 technical-border p-5">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">{t.voteSubmittedPage.myChoice}</p>
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-4xl ${choice === 1 ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  {choiceIcon}
                </span>
                <span
                  className={`text-3xl font-display font-black uppercase tracking-tight ${choice === 1 ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  {choiceLabel}
                </span>
              </div>
            </div>
            <div className="bg-slate-50 technical-border border-dashed p-5">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">{t.voteSubmittedPage.votingStats}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-slate-600 uppercase">{t.voteSubmittedPage.intensity}:</span>
                  <span className="text-sm font-mono font-bold text-right">{weight} {t.voteSubmittedPage.votes}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-slate-600 uppercase">{t.voteSubmittedPage.used}:</span>
                  <span className="text-sm font-mono font-bold text-primary text-right">{cost} {t.voteForm.credits}</span>
                </div>
              </div>
            </div>
          </div>

          {/* View on Explorer - centered bordered box */}
          {hasTxHash ? (
            <div className="technical-border bg-slate-50 p-4">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm font-mono text-black font-bold uppercase tracking-wider hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">open_in_new</span>
                {t.voteSubmittedPage.viewOnExplorer}
              </a>
            </div>
          ) : (
            <div className="technical-border bg-slate-50 p-4 text-center">
              <p className="text-sm font-mono text-slate-400 uppercase tracking-wider">
                {t.voteSubmittedPage.txConfirmed}
              </p>
            </div>
          )}
        </div>

        {/* Return Button */}
        <button
          onClick={onBackToList}
          className="sharp-button w-full py-6 bg-black text-white font-display font-bold text-xl uppercase italic tracking-[0.2em] mb-12 flex items-center justify-center gap-3 hover:bg-slate-900 transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          {t.voteSubmittedPage.returnToList}
        </button>

        {/* Privacy Badges */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="technical-border bg-slate-50 p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl">shield_with_heart</span>
            <div>
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">{t.voteSubmittedPage.privacyStatus}</p>
              <p className="text-xs font-display font-bold uppercase tracking-wider">{t.voteSubmittedPage.maciShield}</p>
            </div>
          </div>
          <div className="technical-border bg-slate-50 p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl">analytics</span>
            <div>
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">{t.voteSubmittedPage.proofs}</p>
              <p className="text-xs font-display font-bold uppercase tracking-wider">{t.voteSubmittedPage.zkProofGenerated}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
