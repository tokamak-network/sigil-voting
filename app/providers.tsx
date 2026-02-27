'use client'

import { StrictMode } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider as PrivyWagmiProvider } from '@privy-io/wagmi'
import { WagmiProvider as PlainWagmiProvider } from 'wagmi'
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
  // When Privy App ID is not configured, fall back to plain wagmi (MetaMask-only mode)
  if (!PRIVY_APP_ID) {
    return (
      <StrictMode>
        <PlainWagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <LanguageProvider>{children}</LanguageProvider>
          </QueryClientProvider>
        </PlainWagmiProvider>
      </StrictMode>
    )
  }

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
          <PrivyWagmiProvider config={config}>
            <ProviderSync />
            <LanguageProvider>{children}</LanguageProvider>
          </PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </StrictMode>
  )
}
