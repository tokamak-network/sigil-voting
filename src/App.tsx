import { useState } from 'react'
import { Header, Footer, Toast, LandingPage, MACIVotingDemo, ProposalsList } from './components'
import { LanguageProvider } from './i18n'
import type { Page } from './types'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [selectedPollId, setSelectedPollId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

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

  return (
    <LanguageProvider>
      <div className="app">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

        <Header
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          showToast={showToast}
        />

        <main className="main">
          {currentPage === 'landing' && (
            <LandingPage setCurrentPage={setCurrentPage} />
          )}

          {currentPage === 'proposals' && (
            <ProposalsList onSelectPoll={handleSelectPoll} />
          )}

          {currentPage === 'proposal-detail' && selectedPollId !== null && (
            <MACIVotingDemo pollId={selectedPollId} onBack={handleBackToList} />
          )}
        </main>

        <Footer />
      </div>
    </LanguageProvider>
  )
}

export default App
