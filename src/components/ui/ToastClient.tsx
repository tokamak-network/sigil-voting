'use client'

import { useState, useCallback, useRef } from 'react'
import { ToastContainer } from '../Toast'
import type { ToastItem } from '../Toast'

export function ToastClient() {
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

  return <ToastContainer toasts={toasts} onRemove={removeToast} />
}
