/**
 * ResultsDisplay.test.tsx - Completed results page tests
 */
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'

// Mock wagmi with different return values for different tests
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
  TALLY_ABI: [],
}))

import { ResultsDisplay } from '../../src/components/voting/ResultsDisplay'

const TALLY_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`

describe('ResultsDisplay', () => {
  it('shows loading state when data is pending', () => {
    mockUseReadContract.mockReturnValue({ data: undefined, isLoading: true, isError: false, isPending: true })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    // Should show spinner
    const spinner = document.querySelector('.spinner')
    expect(spinner).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    mockUseReadContract.mockReturnValue({ data: undefined, isLoading: false, isError: true, isPending: false })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    // Should have a retry button
    const retryBtn = screen.getByRole('button')
    expect(retryBtn).toBeInTheDocument()
  })

  it('shows "no votes" message when totalVotes is 0', () => {
    mockUseReadContract.mockReturnValue({ data: 0n, isLoading: false, isError: false, isPending: false })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    // Should show "how_to_vote" icon (no votes state)
    const icon = document.querySelector('.material-symbols-outlined')
    expect(icon).toBeInTheDocument()
  })

  it('renders vote bars when data is available', () => {
    let callCount = 0
    mockUseReadContract.mockImplementation(() => {
      callCount++
      if (callCount % 3 === 1) return { data: 75n, isLoading: false, isError: false, isPending: false } // forVotes
      if (callCount % 3 === 2) return { data: 25n, isLoading: false, isError: false, isPending: false } // againstVotes
      return { data: 5n, isLoading: false, isError: false, isPending: false } // totalVoters
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    // Should render progress bars
    const progressBars = screen.getAllByRole('progressbar')
    expect(progressBars.length).toBe(2) // for + against bars
  })

  it('shows correct percentages', () => {
    let callCount = 0
    mockUseReadContract.mockImplementation(() => {
      callCount++
      if (callCount % 3 === 1) return { data: 75n, isLoading: false, isError: false, isPending: false }
      if (callCount % 3 === 2) return { data: 25n, isLoading: false, isError: false, isPending: false }
      return { data: 5n, isLoading: false, isError: false, isPending: false }
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('shows voter count', () => {
    let callCount = 0
    mockUseReadContract.mockImplementation(() => {
      callCount++
      if (callCount % 3 === 1) return { data: 10n, isLoading: false, isError: false, isPending: false }
      if (callCount % 3 === 2) return { data: 5n, isLoading: false, isError: false, isPending: false }
      return { data: 42n, isLoading: false, isError: false, isPending: false }
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('shows ZK verification section with Etherscan link', () => {
    let callCount = 0
    mockUseReadContract.mockImplementation(() => {
      callCount++
      if (callCount % 3 === 1) return { data: 1n, isLoading: false, isError: false, isPending: false }
      if (callCount % 3 === 2) return { data: 1n, isLoading: false, isError: false, isPending: false }
      return { data: 1n, isLoading: false, isError: false, isPending: false }
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    const link = document.querySelector('a[href*="etherscan"]')
    expect(link).toBeInTheDocument()
  })

  it('has aria-label for results region', () => {
    let callCount = 0
    mockUseReadContract.mockImplementation(() => {
      callCount++
      if (callCount % 3 === 1) return { data: 1n, isLoading: false, isError: false, isPending: false }
      if (callCount % 3 === 2) return { data: 1n, isLoading: false, isError: false, isPending: false }
      return { data: 1n, isLoading: false, isError: false, isPending: false }
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    expect(screen.getByRole('region')).toBeInTheDocument()
  })
})
