import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Delegate Voting Power',
  description:
    'Delegate your voting power to a trusted address in SIGIL governance.',
  alternates: { canonical: '/vote/delegate' },
}

export default function DelegateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
