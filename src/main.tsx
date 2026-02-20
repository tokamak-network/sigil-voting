import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './wagmi'
import './index.css'
import App from './App.tsx'

// Crypto modules (3MB circomlibjs) are lazy-loaded when user navigates to voting pages
// No preload on landing page — keeps initial load fast

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,       // Data fresh for 5s — prevents duplicate fetches
      gcTime: 300000,         // Keep cache 5 min
      refetchOnWindowFocus: false, // Don't refetch on tab switch
      retry: 1,               // Only 1 retry on failure (faster error feedback)
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
