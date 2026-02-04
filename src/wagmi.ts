import { http, createConfig } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Thanos Sepolia Testnet (Tokamak L2)
const thanosSepolia = {
  id: 111551119090,
  name: 'Thanos Sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'TON',
    symbol: 'TON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.thanos-sepolia.tokamak.network'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.thanos-sepolia.tokamak.network' },
  },
  testnet: true,
} as const

export const config = createConfig({
  chains: [thanosSepolia, sepolia, mainnet],
  connectors: [
    injected(),
  ],
  transports: {
    [thanosSepolia.id]: http(),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
})

export { thanosSepolia }
