import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Proposal',
  description:
    'Create a new governance proposal for your community to vote on privately.',
  alternates: { canonical: '/vote/create' },
}

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
