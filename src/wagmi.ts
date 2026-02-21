import { http, fallback, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Sepolia RPC: use Vercel env var if available, otherwise public fallbacks
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined

export const config = createConfig({
  chains: [sepolia],
  connectors: [
    injected(),
  ],
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
