import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { LanguageSwitcher } from '../../src/components/LanguageSwitcher'

describe('LanguageSwitcher', () => {
  it('renders EN and KO buttons', () => {
    renderWithProviders(<LanguageSwitcher />)
    expect(screen.getByText('EN')).toBeInTheDocument()
    expect(screen.getByText('KO')).toBeInTheDocument()
  })

  it('has correct aria-labels', () => {
    renderWithProviders(<LanguageSwitcher />)
    expect(screen.getByLabelText('Switch to English')).toBeInTheDocument()
    expect(screen.getByLabelText('한국어로 전환')).toBeInTheDocument()
  })

  it('defaults to Korean (KO pressed)', () => {
    renderWithProviders(<LanguageSwitcher />)
    expect(screen.getByText('KO')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('EN')).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches to English when EN is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LanguageSwitcher />)
    await user.click(screen.getByText('EN'))
    expect(screen.getByText('EN')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('KO')).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches back to Korean when KO is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LanguageSwitcher />)
    await user.click(screen.getByText('EN'))
    await user.click(screen.getByText('KO'))
    expect(screen.getByText('KO')).toHaveAttribute('aria-pressed', 'true')
  })

  it('has role=group for the button container', () => {
    renderWithProviders(<LanguageSwitcher />)
    expect(screen.getByRole('group')).toBeInTheDocument()
  })
})
