/**
 * VoteSubmitted - Vote submission confirmation page (Page 4)
 *
 * Displays a receipt-style confirmation after a successful vote,
 * including the choice, voting stats, transaction hash, and
 * privacy badges (MACI Shield + ZK-Proof).
 */

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
  const shortHash = txHash.length > 16
    ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}`
    : txHash

  const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`

  const choiceLabel = choice === 1 ? 'FOR' : 'AGAINST'
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
          Vote Submitted Securely
        </h1>

        {/* Transaction Hash */}
        <p className="font-mono text-sm text-slate-500 text-center break-all uppercase tracking-widest">
          Transaction Hash: {shortHash}
        </p>

        {/* Receipt Card */}
        <div className="technical-border bg-white p-8 w-full relative">
          {/* Receipt ID Badge */}
          <div className="absolute -top-3 right-6 bg-slate-100 technical-border px-3 py-1">
            <span className="font-mono text-xs text-slate-500 uppercase tracking-widest">
              Receipt #{pollId}-ZK
            </span>
          </div>

          {/* Proposal Title */}
          <div className="border-l-4 border-primary pl-4 mb-8 mt-2">
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-1">Proposal</p>
            <p className="text-lg font-display font-bold leading-snug">{pollTitle}</p>
          </div>

          {/* My Choice + Voting Stats: side-by-side gray boxes */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-50 technical-border p-5">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">My Choice</p>
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-3xl ${choice === 1 ? 'text-primary' : 'text-black'}`}
                >
                  {choiceIcon}
                </span>
                <span
                  className={`text-2xl font-display font-black uppercase tracking-tight ${choice === 1 ? 'text-primary' : 'text-black'}`}
                >
                  {choiceLabel}
                </span>
              </div>
            </div>
            <div className="bg-slate-50 technical-border p-5">
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Voting Stats</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-slate-600 uppercase">Intensity:</span>
                  <span className="text-sm font-mono font-bold text-right">{weight} Votes</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-slate-600 uppercase">Used:</span>
                  <span className="text-sm font-mono font-bold text-primary text-right">{cost.toFixed(2)} TON</span>
                </div>
              </div>
            </div>
          </div>

          {/* View on Explorer - centered bordered box */}
          <div className="technical-border bg-slate-50 p-4">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm font-mono text-black font-bold uppercase tracking-wider hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              View on Explorer
            </a>
          </div>
        </div>

        {/* Return Button */}
        <button
          onClick={onBackToList}
          className="sharp-button w-full h-14 bg-black text-white font-display font-black text-lg uppercase tracking-tight flex items-center justify-center gap-3 hover:bg-slate-900 transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Return to Proposal List
        </button>

        {/* Privacy Badges */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="technical-border bg-slate-50 p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl">shield</span>
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Privacy Status</p>
              <p className="text-sm font-display font-bold uppercase tracking-wider">MACI Shield Active</p>
            </div>
          </div>
          <div className="technical-border bg-slate-50 p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl">bar_chart</span>
            <div>
              <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Proofs</p>
              <p className="text-sm font-display font-bold uppercase tracking-wider">ZK-Proof Generated</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
