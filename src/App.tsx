import { useState } from 'react'
import { Header, Footer, Toast, LandingPage, QuadraticVotingDemo } from './components'
import type { Page } from './types'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  return (
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
          <QuadraticVotingDemo />
        )}
      </main>

      <Footer />
    </div>
  )
}

export default App
