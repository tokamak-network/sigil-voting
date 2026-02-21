'use client'

import { Suspense, lazy } from 'react'
import { LoadingSpinner } from '../../../components/LoadingSpinner'

const DelegationPage = lazy(
  () => import('../../../../src/components/governance/DelegationPage')
)

export default function DelegatePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <DelegationPage />
    </Suspense>
  )
}
