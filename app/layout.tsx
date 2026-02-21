import type { Metadata } from 'next'
import { Providers } from './providers'
import '../src/index.css'
import '../src/App.css'

export const metadata: Metadata = {
  title: {
    default: 'SIGIL — Your Vote. Your Secret.',
    template: '%s | SIGIL',
  },
  description:
    'DAO votes are public. Whales dominate. Bribes go unchecked. SIGIL is the governance protocol that fixes all three — with permanent privacy, anti-bribery, and quadratic voting on Ethereum.',
  keywords:
    'DAO voting, private voting, quadratic voting, anti-collusion, MACI, zero knowledge, ZK proof, Groth16, Ethereum governance, Tokamak Network, SIGIL',
  metadataBase: new URL('https://sigil-voting.vercel.app'),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'SIGIL — Your Vote. Your Secret.',
    description:
      'Private voting for DAOs. Bribe-proof. Whale-resistant. Built on Ethereum by Tokamak Network.',
    type: 'website',
    url: '/',
    images: [{ url: '/assets/og-image.png', width: 1200, height: 630 }],
    siteName: 'SIGIL',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@Sigil_Builder',
    creator: '@Sigil_Builder',
    title: 'SIGIL — Your Vote. Your Secret.',
    description:
      'Private voting for DAOs. Bribe-proof. Whale-resistant. Built on Ethereum.',
    images: ['/assets/og-image.png'],
  },
  icons: {
    icon: '/assets/symbol.svg',
    apple: '/assets/symbol.svg',
  },
  manifest: '/manifest.json',
  other: {
    'theme-color': '#2563eb',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'SIGIL',
  description:
    'Private, bribe-proof, quadratic voting protocol for DAOs on Ethereum',
  url: 'https://sigil-voting.vercel.app',
  applicationCategory: 'Blockchain',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: {
    '@type': 'Organization',
    name: 'Tokamak Network',
    url: 'https://tokamak.network',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Inter:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
