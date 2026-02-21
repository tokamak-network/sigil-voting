'use client'

import { useRouter } from 'next/navigation'
import { useCallback, Suspense, lazy } from 'react'
import { PageShell } from '../page-shell'
import { LoadingSpinner } from '../components/LoadingSpinner'

const ProposalsList = lazy(() => import('../../src/components/ProposalsList'))

export default function VotePage() {
  const router = useRouter()

  const handleSelectPoll = useCallback(
    (pollId: number) => {
      router.push(`/vote/${pollId}`)
    },
    [router]
  )

  return (
    <PageShell>
      <Suspense fallback={<LoadingSpinner />}>
        <ProposalsList onSelectPoll={handleSelectPoll} />
      </Suspense>
    </PageShell>
  )
}
