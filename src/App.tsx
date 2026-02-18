import { useState, useEffect } from 'react'
import { Header, Footer, Toast, LandingPage, MACIVotingDemo, ProposalsList, VoteSubmitted, TechnologyPage } from './components'
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

  // Scroll to top on page navigation
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentPage])

  const handleSelectPoll = (pollId: number) => {
    setSelectedPollId(pollId)
    setCurrentPage('proposal-detail')
  }

  const handleBackToList = () => {
    setSelectedPollId(null)
    setCurrentPage('proposals')
  }

  const handlePollCreated = (newPollId: number, _pollAddress: `0x${string}`, _title?: string) => {
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
            <CreatePollForm onPollCreated={handlePollCreated} onSelectPoll={handleSelectPoll} />
          )}

          {currentPage === 'technology' && (
            <TechnologyPage setCurrentPage={setCurrentPage} />
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
