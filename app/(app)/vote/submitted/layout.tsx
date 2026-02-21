import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Vote Submitted',
  description: 'Your vote has been submitted and encrypted with ZK proofs.',
}

export default function SubmittedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
