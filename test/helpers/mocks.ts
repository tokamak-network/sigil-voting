import { vi } from 'vitest'

// Default wagmi mock state
export const defaultWagmiMocks = {
  address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
  isConnected: false,
  chainId: 11155111, // sepolia
  isPending: false,
}

// wagmi mocks
export function mockWagmi(overrides?: Partial<typeof defaultWagmiMocks>) {
  const state = { ...defaultWagmiMocks, ...overrides }

  vi.mock('wagmi', () => ({
    useAccount: () => ({
      address: state.isConnected ? state.address : undefined,
      isConnected: state.isConnected,
      chainId: state.chainId,
    }),
    useConnect: () => ({
      connect: vi.fn(),
      isPending: state.isPending,
    }),
    useDisconnect: () => ({
      disconnect: vi.fn(),
    }),
    useSwitchChain: () => ({
      switchChain: vi.fn(),
      isPending: false,
    }),
    useReadContract: () => ({
      data: undefined,
    }),
    WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
  }))

  return state
}

// Contract V2 mocks
export function mockContractV2() {
  vi.mock('../../src/contractV2', () => ({
    MACI_V2_ADDRESS: '0x0000000000000000000000000000000000000001' as `0x${string}`,
    VOICE_CREDIT_PROXY_ADDRESS: '0x0000000000000000000000000000000000000002' as `0x${string}`,
    VOICE_CREDIT_PROXY_ABI: [],
    POLL_ABI: [],
  }))
}
