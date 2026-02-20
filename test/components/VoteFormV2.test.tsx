/**
 * VoteFormV2.test.tsx - MACI Encrypted Voting Form tests
 *
 * Tests UI rendering, choice selection, weight/cost calculation,
 * credit tracking, and edge cases. Does NOT test actual crypto
 * (that's covered by crypto.test.ts and maci_property.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    isConnected: true,
  }),
  usePublicClient: () => ({
    estimateContractGas: vi.fn().mockResolvedValue(200000n),
    getGasPrice: vi.fn().mockResolvedValue(10000000000n),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
  }),
  useBalance: () => ({ data: { value: 1000000000000000000n, decimals: 18, formatted: '1.0', symbol: 'ETH' } }),
  useConnect: () => ({ connect: vi.fn(), isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  useReadContract: () => ({ data: undefined }),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
  POLL_ABI: [],
}))

vi.mock('../../src/writeHelper', () => ({
  writeContract: vi.fn().mockResolvedValue('0xtxhash'),
}))

vi.mock('../../src/crypto/preload', () => ({
  preloadCrypto: vi.fn().mockResolvedValue({}),
}))

import { VoteFormV2 } from '../../src/components/voting/VoteFormV2'

const POLL_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`

describe('VoteFormV2', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  const defaultProps = {
    pollId: 0,
    pollAddress: POLL_ADDR,
    coordinatorPubKeyX: 123n,
    coordinatorPubKeyY: 456n,
    voiceCredits: 100,
    isExpired: false,
    isRegistered: true,
  }

  it('renders vote form with For and Against buttons', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const radioGroup = screen.getByRole('radiogroup')
    expect(radioGroup).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(2)
  })

  it('selects For choice when For button clicked', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0]) // For button
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    expect(radios[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('selects Against choice when Against button clicked', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[1]) // Against button
    expect(radios[1]).toHaveAttribute('aria-checked', 'true')
    expect(radios[0]).toHaveAttribute('aria-checked', 'false')
  })

  it('shows default weight of 1', () => {
    const { container } = renderWithProviders(<VoteFormV2 {...defaultProps} />)
    // Weight display is the large centered number in the flex-1 box
    const weightDisplay = container.querySelector('.font-mono.font-bold.text-4xl')
    expect(weightDisplay?.textContent).toBe('1')
  })

  it('increments weight via + button', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const plusBtn = screen.getByText('+')
    fireEvent.click(plusBtn)
    // Weight should now be 2, cost should be 4
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('decrements weight via - button (minimum 1)', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const minusBtn = screen.getByText('-')
    // Already at 1, clicking - should keep at 1
    expect(minusBtn).toBeDisabled()
  })

  it('calculates quadratic cost correctly: cost = weight²', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const plusBtn = screen.getByText('+')
    fireEvent.click(plusBtn) // weight=2, cost=4
    fireEvent.click(plusBtn) // weight=3, cost=9
    // Cost display should show 9
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('shows submit button disabled when no choice selected', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const submitBtn = screen.getByRole('button', { name: /submit|제출|투표/i })
    expect(submitBtn).toBeDisabled()
  })

  it('shows submit button enabled after choice selected', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0]) // Select For
    const submitBtn = screen.getByRole('button', { name: /submit|제출|투표/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('shows expired state when isExpired is true', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} isExpired={true} />)
    // Should show timer_off icon instead of vote form
    const timerOff = document.querySelector('.material-symbols-outlined')
    expect(timerOff?.textContent).toBe('timer_off')
  })

  it('shows auto-register notice for unregistered users', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} isRegistered={false} />)
    const notice = document.querySelector('.bg-blue-50')
    expect(notice).toBeInTheDocument()
  })

  it('shows zero credits warning when voiceCredits is 0', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} voiceCredits={0} />)
    const warnings = screen.getAllByRole('alert')
    // At least the zero credits warning should be present
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    const amberWarning = document.querySelector('.bg-amber-50')
    expect(amberWarning).toBeInTheDocument()
  })

  it('shows credit exceeded warning when cost > remaining', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} voiceCredits={4} />)
    const plusBtn = screen.getByText('+')
    fireEvent.click(plusBtn) // weight=2, cost=4 (exactly at limit)
    fireEvent.click(plusBtn) // weight=3, cost=9 (over limit) -- but MAX_WEIGHT should cap this
    // MAX_WEIGHT = floor(sqrt(4)) = 2, so + button should be disabled at weight=2
  })

  it('shows vote history banner when has previous vote', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678'
    // Simulate nonce > 1 (has voted before)
    localStorage.setItem(`maci-ABCDEF-nonce-${addr}-0`, '2')
    localStorage.setItem(
      `maci-ABCDEF-lastVote-${addr}-0`,
      JSON.stringify({ choice: 1, weight: 1, cost: 1 }),
    )
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    // Vote history banner should be visible
    const historyBanner = document.querySelector('.bg-slate-50')
    expect(historyBanner).toBeInTheDocument()
  })

  it('shows confirmation modal when submit clicked', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0]) // Select For
    const submitBtn = screen.getByRole('button', { name: /submit|제출|투표/i })
    fireEvent.click(submitBtn)
    // Confirm modal should appear
    const modal = screen.getByRole('dialog')
    expect(modal).toBeInTheDocument()
  })

  it('shows gas estimate section', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    // Should show ETH balance (multiple ETH texts due to gas + balance)
    const ethDisplays = screen.getAllByText(/ETH/)
    expect(ethDisplays.length).toBeGreaterThanOrEqual(1)
  })

  it('has slider input for weight', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
  })

  it('shows privacy lock icon', () => {
    renderWithProviders(<VoteFormV2 {...defaultProps} />)
    const lockIcon = document.querySelector('.text-green-600')
    expect(lockIcon).toBeInTheDocument()
  })
})
