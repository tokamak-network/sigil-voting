import { useState } from 'react'
import { Header, Footer, Toast, LandingPage, MACIVotingDemo } from './components'
import { LanguageProvider } from './i18n'
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

          {currentPage === 'maci-voting' && (
            <MACIVotingDemo />
          )}
        </main>

        <Footer />
      </div>
    </LanguageProvider>
  )
}

export default App
