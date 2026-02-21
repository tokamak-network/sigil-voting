'use client'

import { Suspense, lazy, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { LoadingSpinner } from '../../../components/LoadingSpinner'

const VoteSubmitted = lazy(
  () => import('../../../../src/components/VoteSubmitted')
)

function VoteSubmittedContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const pollId = Number(searchParams.get('pollId') || '0')
  const pollTitle = searchParams.get('pollTitle') || ''
  const choice = Number(searchParams.get('choice') || '0')
  const weight = Number(searchParams.get('weight') || '0')
  const cost = Number(searchParams.get('cost') || '0')
  const txHash = searchParams.get('txHash') || ''

  const handleBackToList = useCallback(() => {
    router.push('/vote')
  }, [router])

  return (
    <VoteSubmitted
      pollId={pollId}
      pollTitle={pollTitle}
      choice={choice}
      weight={weight}
      cost={cost}
      txHash={txHash}
      onBackToList={handleBackToList}
    />
  )
}

export default function VoteSubmittedPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <VoteSubmittedContent />
    </Suspense>
  )
}
