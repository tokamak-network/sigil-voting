import { http, createConfig } from 'wagmi'
import { mainnet, sepolia, localhost } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// Custom localhost chain for Hardhat
const hardhatLocalhost = {
  ...localhost,
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
}

export const config = createConfig({
  chains: [hardhatLocalhost, sepolia, mainnet],
  connectors: [
    injected(),
  ],
  transports: {
    [hardhatLocalhost.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
})

export { sepolia, hardhatLocalhost }
