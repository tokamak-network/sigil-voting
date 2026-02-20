/**
 * TransactionModal.test.tsx - Transaction progress overlay tests
 */
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'
import { TransactionModal, type TxStep } from '../../src/components/voting/TransactionModal'

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useConnect: () => ({ connect: vi.fn(), isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  useReadContract: () => ({ data: undefined }),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const STEPS: TxStep[] = [
  { key: 'encrypting', label: 'Encrypting vote' },
  { key: 'signing', label: 'Signing message' },
  { key: 'confirming', label: 'Confirming transaction' },
  { key: 'waiting', label: 'Waiting for receipt' },
]

describe('TransactionModal', () => {
  it('renders title', () => {
    renderWithProviders(
      <TransactionModal title="Processing Vote" steps={STEPS} currentStep="encrypting" />,
    )
    expect(screen.getByText('Processing Vote')).toBeInTheDocument()
  })

  it('renders all step labels', () => {
    renderWithProviders(
      <TransactionModal title="Test" steps={STEPS} currentStep="encrypting" />,
    )
    STEPS.forEach((step) => {
      expect(screen.getByText(step.label)).toBeInTheDocument()
    })
  })

  it('renders subtitle when provided', () => {
    renderWithProviders(
      <TransactionModal title="Test" steps={STEPS} currentStep="signing" subtitle="Step 2 of 4" />,
    )
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
  })

  it('does not render subtitle when not provided', () => {
    const { container } = renderWithProviders(
      <TransactionModal title="Test" steps={STEPS} currentStep="encrypting" />,
    )
    // subtitle is optional, should not appear
    const subtitleCandidates = container.querySelectorAll('p.text-sm.text-slate-500')
    expect(subtitleCandidates.length).toBe(0)
  })

  it('shows spinner animation', () => {
    const { container } = renderWithProviders(
      <TransactionModal title="Test" steps={STEPS} currentStep="encrypting" />,
    )
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('marks completed steps with green styling', () => {
    const { container } = renderWithProviders(
      <TransactionModal title="Test" steps={STEPS} currentStep="confirming" />,
    )
    // "encrypting" and "signing" should be done (green), "confirming" active, "waiting" pending
    const stepElements = container.querySelectorAll('[class*="border-green-500"]')
    expect(stepElements.length).toBe(2) // encrypting + signing
  })

  it('marks current step with primary styling', () => {
    const { container } = renderWithProviders(
      <TransactionModal title="Test" steps={STEPS} currentStep="signing" />,
    )
    const activeSteps = container.querySelectorAll('[class*="border-primary"]')
    expect(activeSteps.length).toBe(1)
  })
})
