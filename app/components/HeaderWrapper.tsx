'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { Header } from '../../src/components'
import type { Page } from '../../src/types'

const pathToPage: Record<string, Page> = {
  '/': 'landing',
  '/technology': 'technology',
  '/vote': 'proposals',
  '/vote/create': 'create-proposal',
  '/vote/submitted': 'vote-submitted',
}

const pageToPath: Record<Page, string> = {
  landing: '/',
  technology: '/technology',
  proposals: '/vote',
  'proposal-detail': '/vote',
  'create-proposal': '/vote/create',
  'vote-submitted': '/vote/submitted',
}

export function HeaderWrapper() {
  const pathname = usePathname()
  const router = useRouter()

  // Derive current page from pathname
  let currentPage: Page = 'landing'
  if (pathname.startsWith('/vote/') && pathname !== '/vote/create' && pathname !== '/vote/submitted') {
    currentPage = 'proposal-detail'
  } else {
    currentPage = pathToPage[pathname] || 'landing'
  }

  const setCurrentPage = useCallback(
    (page: Page) => {
      router.push(pageToPath[page])
    },
    [router]
  )

  return <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
}
