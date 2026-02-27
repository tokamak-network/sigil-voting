'use client'

import { useEffect } from 'react'
import { useWalletsSafe } from './usePrivySafe'
import { setActiveProvider, type EthereumProvider } from '../lib/ethereum'
import { isPrivyEnabled } from '../wagmi'

/**
 * Syncs the active Privy wallet's EIP-1193 provider to the global registry.
 * No-ops when Privy is not configured.
 */
export function useProviderSync() {
  const { wallets } = useWalletsSafe()

  useEffect(() => {
    if (!isPrivyEnabled) return

    let cancelled = false

    async function sync() {
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

export function ProviderSync() {
  useProviderSync()
  return null
}
