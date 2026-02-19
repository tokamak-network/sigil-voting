import { useEffect } from 'react'

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgClass = type === 'success' ? 'bg-green-50 border-green-500 text-green-800'
    : type === 'error' ? 'bg-red-50 border-red-500 text-red-800'
    : 'bg-blue-50 border-blue-500 text-blue-800'
  const icon = type === 'success' ? '\u2713' : type === 'error' ? '\u2715' : '\u2139'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-2 shadow-lg ${bgClass}`} role={type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span className="text-lg font-bold" aria-hidden="true">{icon}</span>
      <span className="text-sm font-medium">{message}</span>
      <button className="ml-2 text-lg font-bold opacity-60 hover:opacity-100 transition-opacity" onClick={onClose} aria-label="Close notification">&times;</button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onRemove: (id: number) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const visible = toasts.slice(-3)
  return (
    <div className="fixed top-4 right-6 z-50 flex flex-col gap-2">
      {visible.map((toast) => (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => onRemove(toast.id)} />
      ))}
    </div>
  )
}
