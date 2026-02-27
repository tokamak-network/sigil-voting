'use client'

import { StrictMode } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config, sepolia } from '../src/wagmi'
import { LanguageProvider } from '../src/i18n'
import { ProviderSync } from '../src/hooks/useProviderSync'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      gcTime: 300000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          loginMethods: ['email', 'google', 'apple'],
          appearance: {
            theme: 'light',
            accentColor: '#2563eb',
          },
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'users-without-wallets',
            },
          },
          defaultChain: sepolia,
          supportedChains: [sepolia],
        }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={config}>
            <ProviderSync />
            <LanguageProvider>{children}</LanguageProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </StrictMode>
  )
}
