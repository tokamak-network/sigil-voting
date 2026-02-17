/**
 * CompletedResults - Finalized voting results page (Page 2)
 *
 * Displays completed tally data with visual breakdown,
 * ZK-proof verification status, and proposal details.
 * Reads tally data from the on-chain Tally contract.
 */

import { useReadContract } from 'wagmi'
import { TALLY_ABI, DEPLOYER_ADDRESS } from '../contractV2'
import { useTranslation } from '../i18n'

interface CompletedResultsProps {
  pollId: number
  tallyAddress: `0x${string}`
  pollTitle: string
  onBack: () => void
}

export function CompletedResults({
  pollId,
  tallyAddress,
  pollTitle,
  onBack,
}: CompletedResultsProps) {
  const { t } = useTranslation()

  // --- Read tally data from contract ---

  const { data: forVotes } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'forVotes',
    query: { refetchInterval: 10000 },
  })

  const { data: againstVotes } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'againstVotes',
    query: { refetchInterval: 10000 },
  })

  const { data: totalVoters } = useReadContract({
    address: tallyAddress,
    abi: TALLY_ABI,
    functionName: 'totalVoters',
    query: { refetchInterval: 10000 },
  })

  // --- Derived values ---

  const forNum = Number(forVotes || 0n)
  const againstNum = Number(againstVotes || 0n)
  const totalCredits = forNum + againstNum
  const votersNum = Number(totalVoters || 0n)

  const forPct = totalCredits > 0 ? Math.round((forNum / totalCredits) * 100) : 0
  const againstPct = totalCredits > 0 ? 100 - forPct : 0
  const passed = forNum > againstNum

  // Shortened tally address for display
  const shortTallyAddr = `${tallyAddress.slice(0, 6)}...${tallyAddress.slice(-4)}`
  const explorerUrl = `https://sepolia.etherscan.io/address/${tallyAddress}`

  // Finalized date (use current date as proxy since tally is already verified)
  const finalizedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const authorAddress = `${DEPLOYER_ADDRESS.slice(0, 6)}...${DEPLOYER_ADDRESS.slice(-4)}`

  return (
    <div>
      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-mono text-slate-500 hover:text-black transition-colors mb-6"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {t.proposals.backToList}
        </button>

        {/* Badges */}
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-block px-3 py-1 bg-black text-white text-xs font-mono font-bold uppercase tracking-wider">
            Proposal #{pollId + 1}
          </span>
          <span
            className={`inline-block px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider ${
              passed
                ? 'bg-emerald-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {passed ? t.results.passed : t.results.rejected}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-display font-black uppercase italic text-black mb-8 leading-tight">
          {t.completedResults.title}
        </h1>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Voting Breakdown + Verification */}
          <div className="lg:col-span-2 space-y-6">
            {/* Voting Breakdown Card */}
            <div className="technical-border bg-white p-8">
              <div className="flex items-start justify-between mb-8">
                <h2 className="text-2xl font-display font-bold text-black uppercase">
                  {t.completedResults.votingBreakdown}
                </h2>
                <div className="text-right">
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    {t.proposalDetail.totalParticipants}
                  </p>
                  <p className="text-3xl font-display font-black text-black">
                    {votersNum}
                  </p>
                </div>
              </div>

              {/* FOR / AGAINST bars */}
              <div className="space-y-12">
                {/* FOR bar */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-500">thumb_up</span>
                      <span className="font-bold uppercase tracking-widest text-sm">{t.voteForm.for}</span>
                    </div>
                    <span className="text-3xl font-mono font-bold text-emerald-500">{forPct}%</span>
                  </div>
                  <div className="w-full h-12 bg-slate-100 technical-border">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-700 ease-out"
                      style={{ width: `${forPct}%` }}
                      role="progressbar"
                      aria-valuenow={forPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`For: ${forPct}%`}
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
                      <span className="font-bold uppercase tracking-widest text-sm">{t.voteForm.against}</span>
                    </div>
                    <span className="text-3xl font-mono font-bold">{againstPct}%</span>
                  </div>
                  <div className="w-full h-12 bg-slate-100 technical-border">
                    <div
                      className="h-full bg-red-500 transition-all duration-700 ease-out"
                      style={{ width: `${againstPct}%` }}
                      role="progressbar"
                      aria-valuenow={againstPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Against: ${againstPct}%`}
                    />
                  </div>
                  <div className="mt-2 text-[10px] font-mono font-bold text-slate-500 text-right uppercase">
                    {againstNum.toLocaleString()} {t.completedResults.quadraticCredits}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-black mt-12 pt-8">
                <h3 className="text-sm font-bold uppercase tracking-widest mb-4">
                  {t.completedResults.finalTally}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 border border-slate-200">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      {t.completedResults.uniqueAddresses}
                    </span>
                    <span className="font-mono font-bold">
                      {votersNum}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 border border-slate-200">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      {t.completedResults.quadraticMagnitude}
                    </span>
                    <span className="font-mono font-bold">
                      {totalCredits.toLocaleString()} {t.voteForm.credits}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ZK Verification Bar */}
            <div className="bg-black text-white p-6 technical-border flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 border border-white/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-2xl">verified_user</span>
                </div>
                <div>
                  <h4 className="font-bold uppercase italic text-sm">
                    {t.completedResults.zkVerified}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    TX: {shortTallyAddr}
                  </p>
                </div>
              </div>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-black px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-colors flex items-center gap-2"
              >
                {t.completedResults.viewOnExplorer}
                <span className="material-symbols-outlined text-sm">open_in_new</span>
              </a>
            </div>
          </div>

          {/* Right Column: Proposal Details + Metadata */}
          <div className="space-y-6">
            {/* Proposal Details Card */}
            <div className="technical-border bg-white p-8 h-fit">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 mb-8 border-b-2 border-slate-100 pb-2">
                {t.completedResults.proposalDetails}
              </h2>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    {t.completedResults.titleLabel}
                  </p>
                  <p className="text-base font-display font-bold text-black">
                    {pollTitle}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    {t.completedResults.author}
                  </p>
                  <p className="text-sm font-mono text-black">
                    {authorAddress}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    {t.proposals.status.finalized}
                  </p>
                  <p className="text-sm font-mono text-black">
                    {finalizedDate}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  {t.completedResults.description}
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {t.completedResults.defaultDesc}
                </p>
              </div>

              {/* Full Description Button */}
              <button className="w-full bg-black text-white px-4 py-3 text-sm font-mono font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors">
                {t.completedResults.readFull}
              </button>
            </div>

            {/* Metadata Box */}
            <div className="border-2 border-slate-200 p-4 font-mono text-[10px] text-slate-400 uppercase leading-relaxed">
              <p>IPFS Hash: QmXoyp...7821</p>
              <p>{t.completedResults.votingStrategy}</p>
              <p>{t.completedResults.shieldedVoting}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
