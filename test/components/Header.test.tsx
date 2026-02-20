import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { Header } from '../../src/components/Header'

// Mock wagmi hooks
const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
const mockSwitchChain = vi.fn()

let mockAccountState = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  chainId: 11155111 as number | undefined,
}

let mockVoiceCredits: unknown = undefined
let mockGateCount: unknown = 0n
let mockCanCreate: unknown = true

vi.mock('wagmi', () => ({
  useAccount: () => mockAccountState,
  useConnect: () => ({ connect: mockConnect, isPending: false }),
  useDisconnect: () => ({ disconnect: mockDisconnect }),
  useSwitchChain: () => ({ switchChain: mockSwitchChain, isPending: false }),
  useReadContract: (config: any) => {
    if (config?.functionName === 'getVoiceCredits') return { data: mockVoiceCredits, isLoading: false }
    if (config?.functionName === 'proposalGateCount') return { data: mockGateCount, isLoading: false }
    if (config?.functionName === 'canCreatePoll') return { data: mockCanCreate, isLoading: false }
    return { data: undefined, isLoading: false }
  },
}))

vi.mock('wagmi/connectors', () => ({
  injected: () => 'injected-connector',
}))

vi.mock('../../src/wagmi', () => ({
  sepolia: { id: 11155111 },
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0x0000000000000000000000000000000000000001',
  MACI_ABI: [],
  VOICE_CREDIT_PROXY_ADDRESS: '0x0000000000000000000000000000000000000002',
  VOICE_CREDIT_PROXY_ABI: [],
}))

describe('Header', () => {
  const setCurrentPage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountState = {
      address: undefined,
      isConnected: false,
      chainId: 11155111,
    }
    mockVoiceCredits = undefined
    mockGateCount = 0n
    mockCanCreate = true
  })

  it('renders the SIGIL brand name', () => {
    renderWithProviders(<Header currentPage="landing" setCurrentPage={setCurrentPage} />)
    expect(screen.getByText('SIGIL')).toBeInTheDocument()
  })

  it('shows connect button when not connected', () => {
    renderWithProviders(<Header currentPage="landing" setCurrentPage={setCurrentPage} />)
    const connectButton = screen.getByRole('button', { name: /connect|연결/i })
    expect(connectButton).toBeInTheDocument()
  })

  it('calls connect when connect button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Header currentPage="landing" setCurrentPage={setCurrentPage} />)
    const connectButton = screen.getByRole('button', { name: /connect|연결/i })
    await user.click(connectButton)
    expect(mockConnect).toHaveBeenCalled()
  })

  it('shows shortened address when connected', () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    renderWithProviders(<Header currentPage="landing" setCurrentPage={setCurrentPage} />)
    expect(screen.getByText('0x1234...5678')).toBeInTheDocument()
  })

  it('shows wrong network button when on wrong chain', () => {
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 1, // mainnet, not sepolia
    }
    renderWithProviders(<Header currentPage="landing" setCurrentPage={setCurrentPage} />)
    expect(screen.getByText(/Wrong Network|네트워크 변경/i)).toBeInTheDocument()
  })

  it('navigates to proposals page when Vote nav is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Header currentPage="landing" setCurrentPage={setCurrentPage} />)
    // Desktop nav has Vote button (ko: "투표하기", en: "Vote")
    const voteButtons = screen.getAllByText(/Vote|투표하기/i)
    await user.click(voteButtons[0])
    expect(setCurrentPage).toHaveBeenCalledWith('proposals')
  })

  it('shows testnet badge', () => {
    renderWithProviders(<Header currentPage="landing" setCurrentPage={setCurrentPage} />)
    expect(screen.getByText(/Testnet|테스트넷/i)).toBeInTheDocument()
  })
})
