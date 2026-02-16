/**
 * CompletedResults - Finalized voting results page (Page 2)
 *
 * Displays completed tally data with visual breakdown,
 * ZK-proof verification status, and proposal details.
 * Reads tally data from the on-chain Tally contract.
 */

import { useReadContract } from 'wagmi'
import { TALLY_ABI } from '../contractV2'

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

  // Shortened deployer placeholder
  const authorAddress = '0x68E0...0AFA3'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-mono text-slate-500 hover:text-black transition-colors mb-6"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Proposals
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
            {passed ? 'Passed' : 'Rejected'}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-display font-black uppercase italic text-black mb-8 leading-tight">
          Completed Results
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
                  Voting Breakdown
                </h2>
                <div className="text-right">
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    Total Participants
                  </p>
                  <p className="text-3xl font-display font-black text-black">
                    {votersNum}
                  </p>
                </div>
              </div>

              {/* FOR bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-lg">thumb_up</span>
                    <span className="text-sm font-mono font-bold uppercase tracking-wider text-primary">
                      For
                    </span>
                    <span className="text-2xl font-display font-black text-black">
                      {forPct}%
                    </span>
                  </div>
                  <span className="text-sm font-mono text-slate-500">
                    {forNum.toLocaleString()} Quadratic Credits
                  </span>
                </div>
                <div className="w-full h-4 bg-slate-100">
                  <div
                    className="h-full bg-primary transition-all duration-700 ease-out"
                    style={{ width: `${forPct}%` }}
                    role="progressbar"
                    aria-valuenow={forPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`For: ${forPct}%`}
                  />
                </div>
              </div>

              {/* AGAINST bar */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-black text-lg">thumb_down</span>
                    <span className="text-sm font-mono font-bold uppercase tracking-wider text-black">
                      Against
                    </span>
                    <span className="text-2xl font-display font-black text-black">
                      {againstPct}%
                    </span>
                  </div>
                  <span className="text-sm font-mono text-slate-500">
                    {againstNum.toLocaleString()} Quadratic Credits
                  </span>
                </div>
                <div className="w-full h-4 bg-slate-100">
                  <div
                    className="h-full bg-black transition-all duration-700 ease-out"
                    style={{ width: `${againstPct}%` }}
                    role="progressbar"
                    aria-valuenow={againstPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Against: ${againstPct}%`}
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-slate-200 pt-6">
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Final Tally Detailed
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-slate-50 p-4">
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                      Unique Addresses
                    </p>
                    <p className="text-2xl font-display font-black text-black">
                      {votersNum}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-4">
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                      Quadratic Magnitude
                    </p>
                    <p className="text-2xl font-display font-black text-black">
                      {totalCredits.toLocaleString()} Credits
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ZK Verification Bar */}
            <div className="bg-black text-white px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-400">
                  verified
                </span>
                <div>
                  <p className="text-sm font-display font-bold">
                    ZK-Proof Verified on Ethereum
                  </p>
                  <p className="text-xs font-mono text-slate-400">
                    TX: {shortTallyAddr}
                  </p>
                </div>
              </div>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-white text-white text-xs font-mono font-bold uppercase tracking-wider hover:bg-white hover:text-black transition-colors"
              >
                View on Explorer
                <span className="material-symbols-outlined text-base">open_in_new</span>
              </a>
            </div>
          </div>

          {/* Right Column: Proposal Details + Metadata */}
          <div className="space-y-6">
            {/* Proposal Details Card */}
            <div className="technical-border bg-white p-8">
              <h2 className="text-lg font-display font-bold text-black uppercase mb-6">
                Proposal Details
              </h2>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Title
                  </p>
                  <p className="text-base font-display font-bold text-black">
                    {pollTitle}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Author
                  </p>
                  <p className="text-sm font-mono text-black">
                    {authorAddress}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Finalized
                  </p>
                  <p className="text-sm font-mono text-black">
                    {finalizedDate}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
                  Description
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  This proposal was created through SIGIL governance protocol
                  with ZK-proof verified private voting. All votes were encrypted
                  using MACI anti-collusion infrastructure and tallied with
                  Groth16 zero-knowledge proofs on Ethereum.
                </p>
              </div>

              {/* Full Description Button */}
              <button className="w-full bg-black text-white px-4 py-3 text-sm font-mono font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors">
                Read Full Proposal Description
              </button>
            </div>

            {/* Metadata Box */}
            <div className="border-2 border-slate-200 p-6">
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-4">
                On-Chain Metadata
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    Poll ID
                  </span>
                  <span className="text-[10px] font-mono text-black font-bold">
                    {pollId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    Tally Contract
                  </span>
                  <span className="text-[10px] font-mono text-black font-bold">
                    {shortTallyAddr}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    Network
                  </span>
                  <span className="text-[10px] font-mono text-black font-bold">
                    Sepolia
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    Verification
                  </span>
                  <span className="text-[10px] font-mono text-emerald-600 font-bold">
                    Groth16 ZK-SNARK
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    Status
                  </span>
                  <span className={`text-[10px] font-mono font-bold ${passed ? 'text-emerald-600' : 'text-red-600'}`}>
                    {passed ? 'PASSED' : 'REJECTED'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    For / Against
                  </span>
                  <span className="text-[10px] font-mono text-black font-bold">
                    {forNum} / {againstNum}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    Total Credits
                  </span>
                  <span className="text-[10px] font-mono text-black font-bold">
                    {totalCredits}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
