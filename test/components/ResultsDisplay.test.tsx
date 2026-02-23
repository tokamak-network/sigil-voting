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
  TIMELOCK_EXECUTOR_ADDRESS: '0x0000000000000000000000000000000000000000',
  TIMELOCK_EXECUTOR_ABI: [],
}))

vi.mock('../../src/components/governance/ExecutionPanel', () => ({
  ExecutionPanel: () => null,
}))

import { ResultsDisplay } from '../../src/components/voting/ResultsDisplay'

const TALLY_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`

function mockReadContract(values: Record<string, { data: unknown; isLoading?: boolean; isError?: boolean; isPending?: boolean }>) {
  mockUseReadContract.mockImplementation((config: any) => {
    const fn = config?.functionName as string
    const v = values[fn]
    if (v) return { data: v.data, isLoading: v.isLoading ?? false, isError: v.isError ?? false, isPending: v.isPending ?? false }
    return { data: undefined, isLoading: false, isError: false, isPending: false }
  })
}

describe('ResultsDisplay', () => {
  it('shows loading state when data is pending', () => {
    mockReadContract({
      forVotes: { data: undefined, isLoading: true, isPending: true },
      againstVotes: { data: undefined, isLoading: true, isPending: true },
      totalVoters: { data: undefined, isLoading: true },
      tallyVerified: { data: undefined, isLoading: true },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    const spinner = document.querySelector('.spinner')
    expect(spinner).toBeInTheDocument()
  })

  it('shows error state with retry button', () => {
    mockReadContract({
      forVotes: { data: undefined, isError: true },
      againstVotes: { data: undefined, isError: true },
      totalVoters: { data: undefined },
      tallyVerified: { data: undefined },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    const retryBtn = screen.getByRole('button')
    expect(retryBtn).toBeInTheDocument()
  })

  it('shows "no votes" message when totalVotes is 0', () => {
    mockReadContract({
      forVotes: { data: 0n },
      againstVotes: { data: 0n },
      totalVoters: { data: 0n },
      tallyVerified: { data: true },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    const icon = document.querySelector('.material-symbols-outlined')
    expect(icon).toBeInTheDocument()
  })

  it('renders vote bars when data is available', () => {
    mockReadContract({
      forVotes: { data: 75n },
      againstVotes: { data: 25n },
      totalVoters: { data: 5n },
      tallyVerified: { data: true },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    const progressBars = screen.getAllByRole('progressbar')
    expect(progressBars.length).toBe(2) // for + against bars
  })

  it('shows correct percentages', () => {
    mockReadContract({
      forVotes: { data: 75n },
      againstVotes: { data: 25n },
      totalVoters: { data: 5n },
      tallyVerified: { data: true },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('shows voter count', () => {
    mockReadContract({
      forVotes: { data: 10n },
      againstVotes: { data: 5n },
      totalVoters: { data: 42n },
      tallyVerified: { data: true },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('shows ZK verification section with Etherscan link', () => {
    mockReadContract({
      forVotes: { data: 1n },
      againstVotes: { data: 1n },
      totalVoters: { data: 1n },
      tallyVerified: { data: true },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    const link = document.querySelector('a[href*="etherscan"]')
    expect(link).toBeInTheDocument()
  })

  it('has aria-label for results region', () => {
    mockReadContract({
      forVotes: { data: 1n },
      againstVotes: { data: 1n },
      totalVoters: { data: 1n },
      tallyVerified: { data: true },
    })
    renderWithProviders(<ResultsDisplay tallyAddress={TALLY_ADDR} />)
    expect(screen.getByRole('region')).toBeInTheDocument()
  })
})
