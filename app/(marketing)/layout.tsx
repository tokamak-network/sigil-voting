'use client'

import { PageShell } from '../page-shell'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PageShell>{children}</PageShell>
}
