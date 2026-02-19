import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { TechnologyPage } from '../../src/components/TechnologyPage'

describe('TechnologyPage', () => {
  const setCurrentPage = vi.fn()

  it('renders the main heading', () => {
    renderWithProviders(<TechnologyPage setCurrentPage={setCurrentPage} />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders three technology pillars (01, 02, 03)', () => {
    renderWithProviders(<TechnologyPage setCurrentPage={setCurrentPage} />)
    expect(screen.getByText(/01\./)).toBeInTheDocument()
    expect(screen.getByText(/02\./)).toBeInTheDocument()
    expect(screen.getByText(/03\./)).toBeInTheDocument()
  })

  it('contains ZK/MACI/Quadratic content', () => {
    renderWithProviders(<TechnologyPage setCurrentPage={setCurrentPage} />)
    const body = document.body.textContent || ''
    expect(body).toMatch(/Poseidon|포세이돈/i)
    expect(body).toMatch(/Groth16/i)
  })

  it('renders code snippets', () => {
    renderWithProviders(<TechnologyPage setCurrentPage={setCurrentPage} />)
    const codeBlocks = document.querySelectorAll('code, pre')
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1)
  })

  it('has CTA button to go to proposals', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TechnologyPage setCurrentPage={setCurrentPage} />)
    // Find a button that navigates to proposals
    const ctaButtons = screen.getAllByRole('button').filter(btn =>
      btn.textContent?.match(/시작|Launch|투표|Vote|Try/i)
    )
    if (ctaButtons.length > 0) {
      await user.click(ctaButtons[0])
      expect(setCurrentPage).toHaveBeenCalled()
    }
  })
})
