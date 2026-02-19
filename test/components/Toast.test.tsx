import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast, ToastContainer } from '../../src/components/Toast'

describe('Toast', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('renders success toast with checkmark', () => {
    render(<Toast message="Success!" type="success" onClose={onClose} />)
    expect(screen.getByText('Success!')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders error toast with role=alert', () => {
    render(<Toast message="Error!" type="error" onClose={onClose} />)
    expect(screen.getByText('Error!')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders info toast', () => {
    render(<Toast message="Info" type="info" onClose={onClose} />)
    expect(screen.getByText('Info')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('auto-closes after 5 seconds', () => {
    render(<Toast message="Auto" type="success" onClose={onClose} />)
    expect(onClose).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when close button is clicked', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    render(<Toast message="Close me" type="info" onClose={onClose} />)
    await user.click(screen.getByLabelText('Close notification'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('ToastContainer', () => {
  const onRemove = vi.fn()

  it('renders multiple toasts', () => {
    const toasts = [
      { id: 1, message: 'First', type: 'success' as const },
      { id: 2, message: 'Second', type: 'error' as const },
    ]
    render(<ToastContainer toasts={toasts} onRemove={onRemove} />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('only shows last 3 toasts', () => {
    const toasts = [
      { id: 1, message: 'One', type: 'info' as const },
      { id: 2, message: 'Two', type: 'info' as const },
      { id: 3, message: 'Three', type: 'info' as const },
      { id: 4, message: 'Four', type: 'info' as const },
    ]
    render(<ToastContainer toasts={toasts} onRemove={onRemove} />)
    expect(screen.queryByText('One')).not.toBeInTheDocument()
    expect(screen.getByText('Two')).toBeInTheDocument()
    expect(screen.getByText('Three')).toBeInTheDocument()
    expect(screen.getByText('Four')).toBeInTheDocument()
  })

  it('renders nothing when toasts are empty', () => {
    const { container } = render(<ToastContainer toasts={[]} onRemove={onRemove} />)
    expect(container.querySelectorAll('[role="status"], [role="alert"]')).toHaveLength(0)
  })
})
