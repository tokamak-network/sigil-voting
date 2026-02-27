import { http, fallback } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { createConfig } from '@privy-io/wagmi'

// Sepolia RPC: use Vercel env var if available, otherwise public fallbacks
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined

export const config = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: sepoliaRpcUrl
      ? http(sepoliaRpcUrl)
      : fallback([
          http('https://ethereum-sepolia-rpc.publicnode.com'),
          http('https://rpc.sepolia.org'),
          http('https://sepolia.gateway.tenderly.co'),
        ]),
  },
})

export { sepolia }

/**
 * Whether Privy is configured (App ID present).
 * Components can use this to decide between Privy login and injected connector.
 */
export const isPrivyEnabled = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID
