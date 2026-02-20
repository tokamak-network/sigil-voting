import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { Header, Footer, ToastContainer, LandingPage, TechnologyPage } from './components'
import type { ToastItem } from './components'
import { LanguageProvider } from './i18n'
import type { Page } from './types'

// Lazy-load heavy pages (only loaded when navigated to)
const MACIVotingDemo = lazy(() => import('./components/MACIVotingDemo'))
const ProposalsList = lazy(() => import('./components/ProposalsList'))
const CreatePollForm = lazy(() => import('./components/CreatePollForm'))
const VoteSubmitted = lazy(() => import('./components/VoteSubmitted'))

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
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type }])
  }, [])
  // Expose addToast for future use (toast stacking system)
  void addToast
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])
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
        <ToastContainer toasts={toasts} onRemove={removeToast} />

        <Header
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
        />

        <main className="flex-grow">
          {currentPage === 'landing' && (
            <LandingPage setCurrentPage={setCurrentPage} />
          )}

          {currentPage === 'technology' && (
            <TechnologyPage setCurrentPage={setCurrentPage} />
          )}

          <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span></div>}>
            {currentPage === 'proposals' && (
              <ProposalsList onSelectPoll={handleSelectPoll} />
            )}

            {currentPage === 'proposal-detail' && selectedPollId !== null && (
              <MACIVotingDemo
                pollId={selectedPollId}
                onBack={handleBackToList}
                onVoteSubmitted={handleVoteSubmitted}
              />
            )}

            {currentPage === 'create-proposal' && (
              <CreatePollForm onPollCreated={handlePollCreated} onSelectPoll={handleSelectPoll} />
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
          </Suspense>
        </main>

        <Footer />
      </div>
    </LanguageProvider>
  )
}

export default App
