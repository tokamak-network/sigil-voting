/**
 * MergingStatus.test.tsx - AccQueue merge progress UI tests
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
  POLL_ABI: [],
}))

import { MergingStatus } from '../../src/components/voting/MergingStatus'

const POLL_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`

describe('MergingStatus', () => {
  beforeEach(() => {
    mockUseReadContract.mockReturnValue({ data: false, isPending: false })
  })

  it('renders merge status header', () => {
    renderWithProviders(<MergingStatus pollAddress={POLL_ADDR} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows spinner while merging', () => {
    renderWithProviders(<MergingStatus pollAddress={POLL_ADDR} />)
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('shows elapsed timer', () => {
    renderWithProviders(<MergingStatus pollAddress={POLL_ADDR} />)
    // Timer should show 0:00 or similar
    expect(screen.getByText(/0:0/)).toBeInTheDocument()
  })

  it('shows two merge steps (state + message)', () => {
    renderWithProviders(<MergingStatus pollAddress={POLL_ADDR} />)
    // Step numbers 01 and 02
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
  })

  it('shows "all merged" banner when both queues merged', () => {
    mockUseReadContract.mockReturnValue({ data: true, isPending: false })
    renderWithProviders(<MergingStatus pollAddress={POLL_ADDR} />)
    const checkIcon = document.querySelector('.text-green-600')
    expect(checkIcon).toBeInTheDocument()
  })

  it('shows progress bar', () => {
    const { container } = renderWithProviders(<MergingStatus pollAddress={POLL_ADDR} />)
    const progressBar = container.querySelector('[class*="bg-primary"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('shows timeline note', () => {
    renderWithProviders(<MergingStatus pollAddress={POLL_ADDR} />)
    const scheduleIcon = document.querySelector('.material-symbols-outlined')
    expect(scheduleIcon).toBeInTheDocument()
  })
})
