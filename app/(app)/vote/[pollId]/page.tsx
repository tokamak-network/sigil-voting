'use client'

import { use, Suspense, lazy, useCallback, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { usePrivySafe } from '../../../../src/hooks/usePrivySafe'
import { isPrivyEnabled } from '../../../../src/wagmi'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { InviteOnboarding } from '../../../../src/components/InviteOnboarding'

const MACIVotingDemo = lazy(
  () => import('../../../../src/components/MACIVotingDemo')
)

interface PollPageProps {
  params: Promise<{ pollId: string }>
}

export default function PollDetailPage({ params }: PollPageProps) {
  const { pollId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const pollIdNum = Number(pollId)
  const isInvite = searchParams.get('invite') === 'true'
  const { login, authenticated, ready: privyReady } = usePrivySafe()
  const { isConnected } = useAccount()
  const [onboardingDone, setOnboardingDone] = useState(false)

  // Auto-login for invite links (only when Privy is enabled)
  useEffect(() => {
    if (isInvite && isPrivyEnabled && privyReady && !authenticated) {
      login()
    }
  }, [isInvite, privyReady, authenticated, login])

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
      const searchParamsObj = new URLSearchParams({
        pollId: String(data.pollId),
        pollTitle: data.pollTitle,
        choice: String(data.choice),
        weight: String(data.weight),
        cost: String(data.cost),
        txHash: data.txHash,
      })
      router.push(`/vote/submitted?${searchParamsObj.toString()}`)
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

  // Show onboarding flow for invite links (authenticated but waiting for wallet)
  if (isInvite && !onboardingDone && authenticated && !isConnected) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <InviteOnboarding onReady={() => setOnboardingDone(true)} />
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
