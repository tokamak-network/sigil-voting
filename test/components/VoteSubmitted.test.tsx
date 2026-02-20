import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import VoteSubmitted from '../../src/components/VoteSubmitted'

const defaultProps = {
  pollId: 0,
  pollTitle: 'Test Proposal',
  choice: 1,
  weight: 3,
  cost: 9,
  txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  onBackToList: vi.fn(),
}

describe('VoteSubmitted', () => {
  it('renders the confirmation title', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('displays poll title', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} />)
    expect(screen.getByText('Test Proposal')).toBeInTheDocument()
  })

  it('shows FOR choice when choice=1', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} choice={1} />)
    const body = document.body.textContent || ''
    expect(body).toMatch(/찬성|FOR/i)
  })

  it('shows AGAINST choice when choice=0', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} choice={0} />)
    const body = document.body.textContent || ''
    expect(body).toMatch(/반대|AGAINST/i)
  })

  it('displays vote weight and cost', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} weight={5} cost={25} />)
    const body = document.body.textContent || ''
    expect(body).toContain('5')
    expect(body).toContain('25')
  })

  it('renders Etherscan link with correct tx hash', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} />)
    const link = document.querySelector('a[href*="sepolia.etherscan.io"]')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', expect.stringContaining(defaultProps.txHash))
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('hides explorer link when txHash is empty', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} txHash="" />)
    const link = document.querySelector('a[href*="sepolia.etherscan.io"]')
    expect(link).not.toBeInTheDocument()
  })

  it('calls onBackToList when return button is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<VoteSubmitted {...defaultProps} onBackToList={onBack} />)
    const returnBtn = screen.getAllByRole('button').find(btn =>
      btn.textContent?.match(/목록|return|돌아가기|back/i)
    )
    expect(returnBtn).toBeDefined()
    await user.click(returnBtn!)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows receipt number based on pollId', () => {
    renderWithProviders(<VoteSubmitted {...defaultProps} pollId={2} />)
    expect(screen.getByText(/RECEIPT #3-ZK/)).toBeInTheDocument()
  })
})
