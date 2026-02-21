'use client'

import { useRouter } from 'next/navigation'
import { useCallback, Suspense, lazy } from 'react'
import { LoadingSpinner } from '../../../components/LoadingSpinner'

const CreatePollForm = lazy(
  () => import('../../../../src/components/CreatePollForm')
)

export default function CreatePollPage() {
  const router = useRouter()

  const handlePollCreated = useCallback(
    (pollId: number, _pollAddress: `0x${string}`) => {
      router.push(`/vote/${pollId}`)
    },
    [router]
  )

  const handleSelectPoll = useCallback(
    (pollId: number) => {
      router.push(`/vote/${pollId}`)
    },
    [router]
  )

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CreatePollForm
        onPollCreated={handlePollCreated}
        onSelectPoll={handleSelectPoll}
      />
    </Suspense>
  )
}
