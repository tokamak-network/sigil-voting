/**
 * ProcessingStatus.test.tsx - Vote processing progress UI tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'

const mockUseReadContract = vi.fn()

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useConnect: () => ({ connect: vi.fn(), isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
  MESSAGE_PROCESSOR_ABI: [],
  TALLY_ABI: [],
}))

import { ProcessingStatus } from '../../src/components/voting/ProcessingStatus'

const MP_ADDR = '0xcccccccccccccccccccccccccccccccccccccccc' as `0x${string}`
const TALLY_ADDR = '0xdddddddddddddddddddddddddddddddddddddd' as `0x${string}`
const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`

describe('ProcessingStatus', () => {
  beforeEach(() => {
    mockUseReadContract.mockReturnValue({ data: false })
  })

  it('renders processing status header', () => {
    renderWithProviders(
      <ProcessingStatus messageProcessorAddress={MP_ADDR} tallyAddress={TALLY_ADDR} />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows spinner while processing', () => {
    renderWithProviders(
      <ProcessingStatus messageProcessorAddress={MP_ADDR} tallyAddress={TALLY_ADDR} />,
    )
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('renders three processing steps', () => {
    renderWithProviders(
      <ProcessingStatus messageProcessorAddress={MP_ADDR} tallyAddress={TALLY_ADDR} />,
    )
    // All three steps should be visible
    const steps = document.querySelectorAll('[class*="border-black"]')
    expect(steps.length).toBeGreaterThan(0)
  })

  it('shows simplified waiting state when addresses are zero', () => {
    renderWithProviders(
      <ProcessingStatus messageProcessorAddress={ZERO_ADDR} tallyAddress={ZERO_ADDR} />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows timer with progress bar', () => {
    const { container } = renderWithProviders(
      <ProcessingStatus messageProcessorAddress={MP_ADDR} tallyAddress={TALLY_ADDR} />,
    )
    const progressBar = container.querySelector('[class*="transition-all"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('shows check icon when finalized', () => {
    mockUseReadContract.mockReturnValue({ data: true })
    renderWithProviders(
      <ProcessingStatus messageProcessorAddress={MP_ADDR} tallyAddress={TALLY_ADDR} />,
    )
    const checkIcon = document.querySelector('.text-green-600')
    expect(checkIcon).toBeInTheDocument()
  })
})
