import { useState } from 'react'
import { Header, Footer, Toast, LandingPage, QuadraticVotingDemo } from './components'
import type { Page } from './types'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [initialProposalId, setInitialProposalId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const navigateToProposal = (proposalId: number) => {
    setInitialProposalId(proposalId)
    setCurrentPage('proposals')
  }

  const handleSetCurrentPage = (page: Page) => {
    if (page !== 'proposals') {
      setInitialProposalId(null)
    }
    setCurrentPage(page)
  }

  return (
    <div className="app">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <Header
        currentPage={currentPage}
        setCurrentPage={handleSetCurrentPage}
        showToast={showToast}
      />

      <main className="main">
        {currentPage === 'landing' && (
          <LandingPage
            setCurrentPage={handleSetCurrentPage}
            navigateToProposal={navigateToProposal}
          />
        )}

        {currentPage === 'proposals' && (
          <QuadraticVotingDemo
            initialProposalId={initialProposalId}
            onProposalViewed={() => setInitialProposalId(null)}
          />
        )}
      </main>

      <Footer />
    </div>
  )
}

export default App
