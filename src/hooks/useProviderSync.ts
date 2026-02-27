'use client'

import { useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { setActiveProvider, type EthereumProvider } from '../lib/ethereum'

/**
 * Syncs the active Privy wallet's EIP-1193 provider to the global registry.
 * This lets writeHelper.ts and other code use getEthereumProvider() seamlessly
 * whether the user connected via MetaMask or Privy embedded wallet.
 */
export function useProviderSync() {
  const { wallets } = useWallets()

  useEffect(() => {
    let cancelled = false

    async function sync() {
      // Find the connected wallet (prefer embedded, then first available)
      const embedded = wallets.find(w => w.walletClientType === 'privy')
      const active = embedded || wallets[0]

      if (!active) {
        setActiveProvider(null)
        return
      }

      try {
        const provider = await active.getEthereumProvider()
        if (!cancelled) {
          setActiveProvider(provider as unknown as EthereumProvider)
        }
      } catch {
        if (!cancelled) setActiveProvider(null)
      }
    }

    sync()
    return () => { cancelled = true }
  }, [wallets])

  return null
}

/**
 * Render-safe component wrapper for useProviderSync.
 * Used in providers.tsx to avoid hooks-in-non-component issues.
 */
export function ProviderSync() {
  useProviderSync()
  return null
}
