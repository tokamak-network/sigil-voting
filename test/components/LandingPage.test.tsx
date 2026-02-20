import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { LandingPage } from '../../src/components/LandingPage'

describe('LandingPage', () => {
  const setCurrentPage = vi.fn()

  it('renders the hero section with title', () => {
    renderWithProviders(<LandingPage setCurrentPage={setCurrentPage} />)
    // The title is split by \n, check both parts are present
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders the Core Features section', () => {
    renderWithProviders(<LandingPage setCurrentPage={setCurrentPage} />)
    expect(screen.getByText(/Core Features|핵심 기능/i)).toBeInTheDocument()
  })

  it('renders the comparison table', () => {
    renderWithProviders(<LandingPage setCurrentPage={setCurrentPage} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    // SIGIL should appear in the table header
    expect(screen.getByText('SIGIL')).toBeInTheDocument()
  })

  it('renders 8 FAQ items', () => {
    renderWithProviders(<LandingPage setCurrentPage={setCurrentPage} />)
    const faqButtons = screen.getAllByRole('button', { expanded: false })
    // There should be 8 FAQ accordion items (6 original + server + ERC20)
    const faqItems = faqButtons.filter(btn => btn.getAttribute('aria-expanded') !== null)
    expect(faqItems.length).toBe(8)
  })

  it('toggles FAQ accordion on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LandingPage setCurrentPage={setCurrentPage} />)
    const faqItems = screen.getAllByRole('button').filter(btn => btn.getAttribute('aria-expanded') !== null)
    const firstFaq = faqItems[0]

    expect(firstFaq).toHaveAttribute('aria-expanded', 'false')
    await user.click(firstFaq)
    expect(firstFaq).toHaveAttribute('aria-expanded', 'true')
    await user.click(firstFaq)
    expect(firstFaq).toHaveAttribute('aria-expanded', 'false')
  })

  it('calls setCurrentPage("proposals") when Enter App button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LandingPage setCurrentPage={setCurrentPage} />)
    // Find the "Launch App" / "앱 실행" button
    const enterButton = screen.getAllByRole('button').find(btn =>
      btn.textContent?.match(/Launch App|앱 실행|앱 시작/i)
    )
    expect(enterButton).toBeDefined()
    await user.click(enterButton!)
    expect(setCurrentPage).toHaveBeenCalledWith('proposals')
  })

  it('shows "coming soon" message when play button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LandingPage setCurrentPage={setCurrentPage} />)
    const playButton = screen.getByLabelText('Play demo video')
    await user.click(playButton)
    // Should show "coming soon" text
    expect(screen.getByText(/coming soon|준비 중/i)).toBeInTheDocument()
  })
})
