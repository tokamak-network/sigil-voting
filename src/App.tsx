import { useState } from 'react'
import { Header, Footer, Toast, LandingPage, MACIVotingDemo, ProposalsList, VoteSubmitted } from './components'
import { CreatePollForm } from './components/CreatePollForm'
import { LanguageProvider } from './i18n'
import type { Page } from './types'

interface VoteSubmittedData {
  pollId: number
  pollTitle: string
  choice: number
  weight: number
  cost: number
  txHash: string
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [voteSubmittedData, setVoteSubmittedData] = useState<VoteSubmittedData | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleSelectPoll = (pollId: number) => {
    setSelectedPollId(pollId)
    setCurrentPage('proposal-detail')
  }

  const handleBackToList = () => {
    setSelectedPollId(null)
    setCurrentPage('proposals')
  }

  const handlePollCreated = (newPollId: number, _newPollAddress: `0x${string}`, _title?: string) => {
    setSelectedPollId(newPollId)
    setCurrentPage('proposal-detail')
  }

  const handleVoteSubmitted = (data: VoteSubmittedData) => {
    setVoteSubmittedData(data)
    setCurrentPage('vote-submitted')
  }

  return (
    <LanguageProvider>
      <div className="min-h-screen flex flex-col">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

        <Header
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          showToast={showToast}
        />

        <main className="flex-grow">
          {currentPage === 'landing' && (
            <LandingPage setCurrentPage={setCurrentPage} />
          )}

          {currentPage === 'proposals' && (
            <div className="max-w-7xl mx-auto px-6 py-12">
              <ProposalsList onSelectPoll={handleSelectPoll} />
            </div>
          )}

          {currentPage === 'proposal-detail' && selectedPollId !== null && (
            <div className="max-w-7xl mx-auto px-6 py-8">
              <MACIVotingDemo
                pollId={selectedPollId}
                onBack={handleBackToList}
                onVoteSubmitted={handleVoteSubmitted}
              />
            </div>
          )}

          {currentPage === 'create-proposal' && (
            <div className="max-w-7xl mx-auto px-6 py-12">
              <header className="mb-12">
                <h1 className="text-6xl font-display font-black uppercase italic leading-none tracking-tighter">CREATE NEW PROPOSAL</h1>
                <div className="mt-4 flex items-center gap-3">
                  <span className="bg-primary text-white text-xs font-bold px-3 py-1 uppercase tracking-widest">DRAFT PHASE</span>
                </div>
              </header>
              <CreatePollForm onPollCreated={handlePollCreated} onSelectPoll={handleSelectPoll} />
            </div>
          )}

          {currentPage === 'vote-submitted' && voteSubmittedData && (
            <VoteSubmitted
              pollId={voteSubmittedData.pollId}
              pollTitle={voteSubmittedData.pollTitle}
              choice={voteSubmittedData.choice}
              weight={voteSubmittedData.weight}
              cost={voteSubmittedData.cost}
              txHash={voteSubmittedData.txHash}
              onBackToList={handleBackToList}
            />
          )}
        </main>

        <Footer />
      </div>
    </LanguageProvider>
  )
}

export default App
