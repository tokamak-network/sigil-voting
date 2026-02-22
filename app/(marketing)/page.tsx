import type { Metadata } from 'next'
import { HomeContent } from '../../src/components/pages/HomeContent'

export const metadata: Metadata = {
  title: 'Your Vote. Your Secret.',
  description:
    'DAO votes are public. Whales dominate. Bribes go unchecked. SIGIL is the governance protocol that fixes all three — with permanent privacy, anti-bribery, and quadratic voting on Ethereum.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'SIGIL — Your Vote. Your Secret.',
    description: 'Private voting for DAOs. Bribe-proof. Whale-resistant. Built on Ethereum by Tokamak Network.',
    url: '/',
    images: [{ url: '/assets/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SIGIL — Your Vote. Your Secret.',
    description: 'Private voting for DAOs. Bribe-proof. Whale-resistant. Built on Ethereum.',
    images: ['/assets/og-image.png'],
  },
}

export default function HomePage() {
  return <HomeContent />
}
