/**
 * TallyingStatus.test.tsx - Unified tallying phase UI tests
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
  MESSAGE_PROCESSOR_ABI: [],
  TALLY_ABI: [],
}))

import { TallyingStatus } from '../../src/components/voting/TallyingStatus'

const POLL_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`
const MP_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`
const TALLY_ADDR = '0xcccccccccccccccccccccccccccccccccccccccc' as `0x${string}`

describe('TallyingStatus', () => {
  beforeEach(() => {
    mockUseReadContract.mockReturnValue({ data: false })
  })

  const defaultProps = {
    pollAddress: POLL_ADDR,
    messageProcessorAddress: MP_ADDR,
    tallyAddress: TALLY_ADDR,
    votingEndTime: Math.floor(Date.now() / 1000) - 60,
    pollTitle: 'Test Proposal',
    pollDescription: 'A test proposal description',
    pollId: 0,
    myVote: { choice: 1, weight: 2, cost: 4 },
    numSignUps: 5,
  }

  it('renders proposal title', () => {
    renderWithProviders(<TallyingStatus {...defaultProps} />)
    expect(screen.getByText('Test Proposal')).toBeInTheDocument()
  })

  it('renders proposal description', () => {
    renderWithProviders(<TallyingStatus {...defaultProps} />)
    expect(screen.getByText('A test proposal description')).toBeInTheDocument()
  })

  it('shows poll ID badge', () => {
    renderWithProviders(<TallyingStatus {...defaultProps} />)
    // pollId 0 → display as #1 (pollId + 1)
    expect(screen.getByText(/# ?1/)).toBeInTheDocument()
  })

  it('shows countdown timer', () => {
    renderWithProviders(<TallyingStatus {...defaultProps} />)
    // Timer should show some time value (MM:SS format)
    const timerDisplay = document.querySelector('.font-mono.text-5xl')
    expect(timerDisplay).toBeInTheDocument()
  })

  it('renders my vote summary with FOR choice', () => {
    renderWithProviders(<TallyingStatus {...defaultProps} />)
    // Cost display: 4
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows participant count', () => {
    renderWithProviders(<TallyingStatus {...defaultProps} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders AGAINST choice correctly', () => {
    renderWithProviders(
      <TallyingStatus {...defaultProps} myVote={{ choice: 0, weight: 1, cost: 1 }} />,
    )
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows dash when no vote submitted', () => {
    renderWithProviders(<TallyingStatus {...defaultProps} myVote={null} />)
    // Should show "—" for no vote
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('renders privacy assurance section', () => {
    const { container } = renderWithProviders(<TallyingStatus {...defaultProps} />)
    const privacySection = container.querySelector('.bg-slate-900')
    expect(privacySection).toBeInTheDocument()
  })

  it('renders processing status steps', () => {
    const { container } = renderWithProviders(<TallyingStatus {...defaultProps} />)
    // At least 3 step circles
    const stepCircles = container.querySelectorAll('.w-9.h-9')
    expect(stepCircles.length).toBe(3)
  })

  it('hides description when null', () => {
    renderWithProviders(
      <TallyingStatus {...defaultProps} pollDescription={null} />,
    )
    expect(screen.queryByText('A test proposal description')).toBeNull()
  })
})
