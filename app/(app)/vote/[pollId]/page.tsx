'use client'

import { use, Suspense, lazy, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '../../../components/LoadingSpinner'

const MACIVotingDemo = lazy(
  () => import('../../../../src/components/MACIVotingDemo')
)

interface PollPageProps {
  params: Promise<{ pollId: string }>
}

export default function PollDetailPage({ params }: PollPageProps) {
  const { pollId } = use(params)
  const router = useRouter()
  const pollIdNum = Number(pollId)

  const handleBack = useCallback(() => {
    router.push('/vote')
  }, [router])

  const handleVoteSubmitted = useCallback(
    (data: {
      pollId: number
      pollTitle: string
      choice: number
      weight: number
      cost: number
      txHash: string
    }) => {
      const searchParams = new URLSearchParams({
        pollId: String(data.pollId),
        pollTitle: data.pollTitle,
        choice: String(data.choice),
        weight: String(data.weight),
        cost: String(data.cost),
        txHash: data.txHash,
      })
      router.push(`/vote/submitted?${searchParams.toString()}`)
    },
    [router]
  )

  if (isNaN(pollIdNum)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-lg font-display font-bold">Invalid poll ID</p>
      </div>
    )
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MACIVotingDemo
        pollId={pollIdNum}
        onBack={handleBack}
        onVoteSubmitted={handleVoteSubmitted}
      />
    </Suspense>
  )
}
