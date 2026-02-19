import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'
import { Footer } from '../../src/components/Footer'

describe('Footer', () => {
  it('renders SIGIL brand', () => {
    renderWithProviders(<Footer />)
    expect(screen.getByAltText('SIGIL')).toBeInTheDocument()
    expect(screen.getByText('SIGIL')).toBeInTheDocument()
  })

  it('renders social links with correct hrefs', () => {
    renderWithProviders(<Footer />)
    const xLink = screen.getByText('X').closest('a')
    expect(xLink).toHaveAttribute('href', 'https://x.com/tokaboratory')
    expect(xLink).toHaveAttribute('rel', 'noopener noreferrer')

    const ghLink = screen.getByText('GH').closest('a')
    expect(ghLink).toHaveAttribute('href', 'https://github.com/tokamak-network/zk-dex-d1-private-voting')

    const tgLink = screen.getByText('TG').closest('a')
    expect(tgLink).toHaveAttribute('href', 'https://t.me/tokamak_network')
  })

  it('renders resource links', () => {
    renderWithProviders(<Footer />)
    const maciLink = document.querySelector('a[href="https://maci.pse.dev"]')
    expect(maciLink).toBeInTheDocument()
    const repoLink = document.querySelectorAll('a[href="https://github.com/tokamak-network/zk-dex-d1-private-voting"]')
    expect(repoLink.length).toBeGreaterThanOrEqual(1)
  })

  it('renders Tokamak Network powered-by section', () => {
    renderWithProviders(<Footer />)
    expect(screen.getByText('Tokamak Network')).toBeInTheDocument()
    expect(screen.getByAltText('Tokamak Network')).toBeInTheDocument()
    const tokamakLink = screen.getByText('Tokamak Network').closest('a')
    expect(tokamakLink).toHaveAttribute('href', 'https://tokamak.network')
  })

  it('renders copyright text', () => {
    renderWithProviders(<Footer />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toMatch(/SIGIL|Tokamak/i)
  })

  it('all external links have target=_blank and rel=noopener', () => {
    renderWithProviders(<Footer />)
    const footer = screen.getByRole('contentinfo')
    const externalLinks = footer.querySelectorAll('a[target="_blank"]')
    externalLinks.forEach(link => {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    })
    expect(externalLinks.length).toBeGreaterThanOrEqual(4)
  })
})
