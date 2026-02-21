import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Active Proposals',
  description:
    'Browse and vote on active governance proposals. Your vote stays permanently private with ZK proofs.',
  alternates: { canonical: '/vote' },
}

export default function VoteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
