import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'
import { PollTimer } from '../../src/components/voting/PollTimer'

let mockTimeData: [bigint, bigint] | undefined = undefined

vi.mock('wagmi', () => ({
  useReadContract: () => ({ data: mockTimeData }),
}))

vi.mock('../../src/contractV2', () => ({
  POLL_ABI: [],
}))

describe('PollTimer', () => {
  const pollAddress = '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`
  const onExpired = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockTimeData = undefined
  })

  it('renders nothing when timeData is not loaded', () => {
    mockTimeData = undefined
    const { container } = renderWithProviders(<PollTimer pollAddress={pollAddress} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows countdown when poll is active', () => {
    // Set deployTime to now and duration to 3600 seconds (1 hour from now)
    const now = BigInt(Math.floor(Date.now() / 1000))
    mockTimeData = [now, 3600n]
    renderWithProviders(<PollTimer pollAddress={pollAddress} />)
    const timer = screen.getByRole('timer')
    expect(timer).toBeInTheDocument()
    // Should show hours, minutes, seconds somewhere
    expect(timer.textContent).toMatch(/\d{2}/)
  })

  it('shows expired state when poll has ended', () => {
    // Set deployTime to 2 hours ago, duration 1 hour → expired 1 hour ago
    const now = BigInt(Math.floor(Date.now() / 1000))
    mockTimeData = [now - 7200n, 3600n]
    renderWithProviders(<PollTimer pollAddress={pollAddress} onExpired={onExpired} />)
    // Should show the ended message
    const timer = screen.getByRole('timer')
    expect(timer).toBeInTheDocument()
    expect(timer.textContent).toMatch(/ended|종료|마감/i)
  })

  it('calls onExpired callback when timer expires', () => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    mockTimeData = [now - 7200n, 3600n]
    renderWithProviders(<PollTimer pollAddress={pollAddress} onExpired={onExpired} />)
    expect(onExpired).toHaveBeenCalledOnce()
  })

  it('displays formatted time with hours:minutes:seconds', () => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    // 2 hours remaining
    mockTimeData = [now, 7200n]
    renderWithProviders(<PollTimer pollAddress={pollAddress} />)
    const timer = screen.getByRole('timer')
    // Should contain "01" for hours (remaining ≈ 1:59:59) or "02" depending on exact timing
    expect(timer.textContent).toMatch(/0[12]/)
  })
})
