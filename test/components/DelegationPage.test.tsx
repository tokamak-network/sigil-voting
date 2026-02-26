import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { DelegationPage } from '../../src/components/governance/DelegationPage'

// Mock wagmi hooks
const mockWriteContract = vi.fn()
const mockWaitForReceipt = vi.fn()

// Stable publicClient mock (same reference across renders prevents useCallback loop)
const stablePublicClient = {
  waitForTransactionReceipt: (...args: unknown[]) => mockWaitForReceipt(...args),
  estimateContractGas: vi.fn().mockResolvedValue(120000n),
}

// Mock getLogsChunked to control marketplace data
const mockGetLogsChunked = vi.fn()
vi.mock('../../src/utils/viemLogs', () => ({
  getLogsChunked: (...args: unknown[]) => mockGetLogsChunked(...args),
}))

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    decodeEventLog: ({ data }: { data: string }) => {
      try {
        return { args: JSON.parse(atob((data as string).slice(2))) }
      } catch {
        throw new Error('bad log')
      }
    },
  }
})

let mockAccountState = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  chainId: 11155111 as number | undefined,
}

let mockCurrentDelegate: unknown = undefined
let mockIsDelegating: unknown = false

vi.mock('wagmi', () => ({
  useAccount: () => mockAccountState,
  usePublicClient: () => stablePublicClient,
  useReadContract: (config: any) => {
    if (config?.functionName === 'getDelegate')
      return { data: mockCurrentDelegate, isLoading: false, refetch: vi.fn() }
    if (config?.functionName === 'isDelegating')
      return { data: mockIsDelegating, isLoading: false, refetch: vi.fn() }
    if (config?.functionName === 'delegationRegistry')
      return { data: '0x0000000000000000000000000000000000000001', isLoading: false, refetch: vi.fn() }
    return { data: undefined, isLoading: false, refetch: vi.fn() }
  },
  useWriteContract: () => ({
    writeContractAsync: mockWriteContract,
    data: undefined,
    isPending: false,
  }),
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
  DELEGATION_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000001',
  DELEGATION_REGISTRY_ABI: [
    { type: 'event', name: 'Delegated', inputs: [{ name: 'delegator', type: 'address', indexed: true }, { name: 'delegate', type: 'address', indexed: true }] },
    { type: 'event', name: 'Undelegated', inputs: [{ name: 'delegator', type: 'address', indexed: true }, { name: 'previousDelegate', type: 'address', indexed: true }] },
  ],
  VOICE_CREDIT_PROXY_ADDRESS: '0x0000000000000000000000000000000000000002',
  DELEGATING_VOICE_CREDIT_PROXY_ABI: [],
  MACI_DEPLOY_BLOCK: 0n,
}))

describe('DelegationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountState = {
      address: undefined,
      isConnected: false,
      chainId: 11155111,
    }
    mockCurrentDelegate = undefined
    mockIsDelegating = false
    mockWaitForReceipt.mockResolvedValue({ status: 'success' })
    mockWriteContract.mockResolvedValue('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    // Default: empty marketplace
    mockGetLogsChunked.mockResolvedValue([])
  })

  it('shows connect wallet message when not connected', async () => {
    renderWithProviders(<DelegationPage />)
    expect(await screen.findByText(/connect|연결|지갑/i)).toBeInTheDocument()
  })

  it('shows delegation form when connected and not delegating', async () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false
    renderWithProviders(<DelegationPage />)
    expect(await screen.findByText(/Delegate Voting Power|투표권 위임/i)).toBeInTheDocument()
    expect(await screen.findByPlaceholderText(/0x/)).toBeInTheDocument()
  })

  it('shows current delegate when delegating', async () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = true
    mockCurrentDelegate = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    renderWithProviders(<DelegationPage />)
    expect(await screen.findByText('0xabcd...abcd')).toBeInTheDocument()
    expect(await screen.findByText(/Remove Delegation|Revoke Delegation|위임 해제/i)).toBeInTheDocument()
  })

  it('shows not delegating message when no delegation', async () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false
    renderWithProviders(<DelegationPage />)
    expect(await screen.findByText(/Not delegating|위임 없음/i)).toBeInTheDocument()
  })

  it('prevents self-delegation', async () => {
    const user = userEvent.setup()
    const addr = '0x1234567890abcdef1234567890abcdef12345678'
    mockAccountState = {
      address: addr,
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false
    renderWithProviders(<DelegationPage />)
    const input = await screen.findByPlaceholderText(/0x/)
    await user.type(input, addr)
    const delegateBtn = screen.getByRole('button', { name: /^Delegate$|^위임하기$/i })
    await user.click(delegateBtn)
    expect(screen.getByText(/Cannot delegate to yourself|본인에게는 위임할 수 없습니다/i)).toBeInTheDocument()
    expect(mockWriteContract).not.toHaveBeenCalled()
  })

  it('calls writeContract when delegating to valid address', async () => {
    const user = userEvent.setup()
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false
    renderWithProviders(<DelegationPage />)
    const input = await screen.findByPlaceholderText(/0x/)
    await user.type(input, '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    const delegateBtn = screen.getByRole('button', { name: /^Delegate$|^위임하기$/i })
    await user.click(delegateBtn)
    expect(mockWriteContract).toHaveBeenCalled()
  })

  it('shows marketplace section when not delegating', async () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false
    renderWithProviders(<DelegationPage />)
    expect(await screen.findByText(/Browse Delegates|위임 대리인 찾기/i)).toBeInTheDocument()
  })

  it('hides marketplace when already delegating', async () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = true
    mockCurrentDelegate = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    renderWithProviders(<DelegationPage />)
    // marketplace section should not appear
    const marketplace = screen.queryByText(/Browse Delegates|위임 대리인 찾기/i)
    expect(marketplace).not.toBeInTheDocument()
  })

  it('fills address input when selecting delegate from marketplace', async () => {
    const user = userEvent.setup()
    const delegatorAddr = '0xaaaa000000000000000000000000000000000001'
    const delegateAddr = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false

    // Return logs with pre-decoded args (as viem returns when event param is provided)
    // First call: Delegated logs; second call: Undelegated logs (empty)
    mockGetLogsChunked
      .mockResolvedValueOnce([{ args: { delegator: delegatorAddr, delegate: delegateAddr } }])
      .mockResolvedValueOnce([])

    renderWithProviders(<DelegationPage />)
    // Wait for marketplace to load and display the select button (the inner <button> element)
    const selectBtns = await screen.findAllByRole('button', { name: /Select|선택/i })
    // Click the actual <button> element (last one if multiple - the outer div role="button" also matches)
    const selectBtn = selectBtns[selectBtns.length - 1]
    await user.click(selectBtn)

    const input = screen.getByPlaceholderText(/0x... address to delegate to/i) as HTMLInputElement
    expect(input.value.toLowerCase()).toBe(delegateAddr.toLowerCase())
  })
})
