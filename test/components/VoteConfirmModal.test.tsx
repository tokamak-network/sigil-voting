/**
 * VoteConfirmModal.test.tsx - Vote confirmation dialog tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'
import { VoteConfirmModal } from '../../src/components/voting/VoteConfirmModal'

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useConnect: () => ({ connect: vi.fn(), isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  useReadContract: () => ({ data: undefined }),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('VoteConfirmModal', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders For choice correctly', () => {
    renderWithProviders(
      <VoteConfirmModal choice={1} weight={3} cost={9} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    // "For" choice should be displayed
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/9/)).toBeInTheDocument()
  })

  it('renders Against choice correctly', () => {
    renderWithProviders(
      <VoteConfirmModal choice={0} weight={1} cost={1} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', () => {
    renderWithProviders(
      <VoteConfirmModal choice={1} weight={2} cost={4} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    // Find and click the first button (confirm)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button clicked', () => {
    renderWithProviders(
      <VoteConfirmModal choice={1} weight={2} cost={4} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1])
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Escape key pressed', () => {
    renderWithProviders(
      <VoteConfirmModal choice={1} weight={2} cost={4} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when overlay clicked', () => {
    const { container } = renderWithProviders(
      <VoteConfirmModal choice={1} weight={2} cost={4} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    // The overlay is the outer fixed div with onClick={onCancel}
    const overlay = container.querySelector('.fixed.inset-0')!
    fireEvent.click(overlay)
    expect(onCancel).toHaveBeenCalled()
  })

  it('does NOT call onCancel when modal content clicked', () => {
    renderWithProviders(
      <VoteConfirmModal choice={1} weight={2} cost={4} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    // Click inside the dialog — stopPropagation should prevent onCancel
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.querySelector('h3')!)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('locks body scroll on mount', () => {
    renderWithProviders(
      <VoteConfirmModal choice={1} weight={1} cost={1} onConfirm={onConfirm} onCancel={onCancel} />,
    )
    expect(document.body.style.overflow).toBe('hidden')
  })
})
