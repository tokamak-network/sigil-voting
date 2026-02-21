import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { DelegationPage } from '../../src/components/governance/DelegationPage'

// Mock wagmi hooks
const mockWriteContract = vi.fn()

let mockAccountState = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  chainId: 11155111 as number | undefined,
}

let mockCurrentDelegate: unknown = undefined
let mockIsDelegating: unknown = false

vi.mock('wagmi', () => ({
  useAccount: () => mockAccountState,
  useReadContract: (config: any) => {
    if (config?.functionName === 'getDelegate')
      return { data: mockCurrentDelegate, isLoading: false, refetch: vi.fn() }
    if (config?.functionName === 'isDelegating')
      return { data: mockIsDelegating, isLoading: false, refetch: vi.fn() }
    return { data: undefined, isLoading: false, refetch: vi.fn() }
  },
  useWriteContract: () => ({
    writeContract: mockWriteContract,
    data: undefined,
    isPending: false,
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
  }),
}))

vi.mock('../../src/contractV2', () => ({
  DELEGATION_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000001',
  DELEGATION_REGISTRY_ABI: [],
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
  })

  it('shows connect wallet message when not connected', () => {
    renderWithProviders(<DelegationPage />)
    expect(screen.getByText(/connect|연결|지갑/i)).toBeInTheDocument()
  })

  it('shows delegation form when connected and not delegating', () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false
    renderWithProviders(<DelegationPage />)
    expect(screen.getByText(/Delegate Voting Power|투표권 위임/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/0x/)).toBeInTheDocument()
  })

  it('shows current delegate when delegating', () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = true
    mockCurrentDelegate = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    renderWithProviders(<DelegationPage />)
    expect(screen.getByText('0xabcd...abcd')).toBeInTheDocument()
    expect(screen.getByText(/Remove Delegation|위임 해제/i)).toBeInTheDocument()
  })

  it('shows not delegating message when no delegation', () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    mockIsDelegating = false
    renderWithProviders(<DelegationPage />)
    expect(screen.getByText(/Not delegating|위임 없음/i)).toBeInTheDocument()
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
    const input = screen.getByPlaceholderText(/0x/)
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
    const input = screen.getByPlaceholderText(/0x/)
    await user.type(input, '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    const delegateBtn = screen.getByRole('button', { name: /^Delegate$|^위임하기$/i })
    await user.click(delegateBtn)
    expect(mockWriteContract).toHaveBeenCalled()
  })
})
