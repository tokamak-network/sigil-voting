import type { Metadata } from 'next'

interface PollLayoutProps {
  params: Promise<{ pollId: string }>
}

export async function generateMetadata({
  params,
}: PollLayoutProps): Promise<Metadata> {
  const { pollId } = await params
  return {
    title: `Proposal #${pollId} — Vote`,
    description: `Cast your private vote on Proposal #${pollId}. Your choice stays permanently encrypted.`,
    alternates: { canonical: `/vote/${pollId}` },
  }
}

export default function PollLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
