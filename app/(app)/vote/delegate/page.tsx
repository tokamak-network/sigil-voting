'use client'

import dynamic from 'next/dynamic'
import { LoadingSpinner } from '../../../components/LoadingSpinner'

const DelegationPage = dynamic(
  () => import('../../../../src/components/governance/DelegationPage'),
  { ssr: false, loading: () => <LoadingSpinner /> },
)

export default function DelegatePage() {
  return <DelegationPage />
}
