import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Sepolia RPC: use Vercel env var if available, otherwise public fallback
const sepoliaRpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL || undefined

export const config = createConfig({
  chains: [sepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [sepolia.id]: http(sepoliaRpcUrl),
  },
})

export { sepolia }
