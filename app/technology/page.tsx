'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { TechnologyPage } from '../../src/components'
import { PageShell } from '../page-shell'
import type { Page } from '../../src/types'

const pageToPath: Record<Page, string> = {
  landing: '/',
  technology: '/technology',
  proposals: '/vote',
  'proposal-detail': '/vote',
  'create-proposal': '/vote/create',
  'vote-submitted': '/vote/submitted',
}

export default function TechnologyRoute() {
  const router = useRouter()
  const setCurrentPage = useCallback(
    (page: Page) => {
      router.push(pageToPath[page])
    },
    [router]
  )

  return (
    <PageShell>
      <TechnologyPage setCurrentPage={setCurrentPage} />
    </PageShell>
  )
}
