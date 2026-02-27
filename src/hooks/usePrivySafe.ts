/**
 * Safe wrapper around Privy hooks.
 * Returns no-op defaults when PrivyProvider is not in the tree.
 * This happens when NEXT_PUBLIC_PRIVY_APP_ID is not set (MetaMask-only mode)
 * or during SSG/SSR pre-rendering.
 */

import { isPrivyEnabled } from '../wagmi'

type PrivyReturn = {
  login: () => void
  logout: () => Promise<void>
  authenticated: boolean
  ready: boolean
}

type WalletsReturn = {
  wallets: Array<{ walletClientType: string; getEthereumProvider: () => Promise<unknown> }>
}

const noopPrivy: PrivyReturn = {
  login: () => {},
  logout: async () => {},
  authenticated: false,
  ready: true,
}

const noopWallets: WalletsReturn = { wallets: [] }

export function usePrivySafe(): PrivyReturn {
  if (!isPrivyEnabled || typeof window === 'undefined') return noopPrivy
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { usePrivy } = require('@privy-io/react-auth')
    return usePrivy()
  } catch {
    return noopPrivy
  }
}

export function useWalletsSafe(): WalletsReturn {
  if (!isPrivyEnabled || typeof window === 'undefined') return noopWallets
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useWallets } = require('@privy-io/react-auth')
    return useWallets()
  } catch {
    return noopWallets
  }
}
