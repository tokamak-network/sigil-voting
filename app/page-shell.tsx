'use client'

import { useState, useCallback, useRef } from 'react'
import { ToastContainer } from '../src/components'
import type { ToastItem } from '../src/components'
import { Footer } from '../src/components'
import { HeaderWrapper } from './components/HeaderWrapper'

export function PageShell({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const addToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info') => {
      const id = ++toastIdRef.current
      setToasts((prev) => [...prev, { id, message, type }])
    },
    []
  )
  void addToast
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <HeaderWrapper />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  )
}
