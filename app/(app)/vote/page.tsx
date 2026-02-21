'use client'

import { useRouter } from 'next/navigation'
import { useCallback, Suspense, lazy } from 'react'
import { LoadingSpinner } from '../../components/LoadingSpinner'

const ProposalsList = lazy(() => import('../../../src/components/ProposalsList'))

export default function VotePage() {
  const router = useRouter()

  const handleSelectPoll = useCallback(
    (pollId: number) => {
      router.push(`/vote/${pollId}`)
    },
    [router]
  )

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ProposalsList onSelectPoll={handleSelectPoll} />
    </Suspense>
  )
}
