import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { Header } from '../../src/components/Header'

// Mock wagmi hooks
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
  useConnect: () => ({ connect: vi.fn(), isPending: false }),
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

// Mock Privy
const mockLogin = vi.fn()
const mockLogout = vi.fn()

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    login: mockLogin,
    logout: mockLogout,
    authenticated: false,
    ready: true,
  }),
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0x0000000000000000000000000000000000000001',
  MACI_ABI: [],
  VOICE_CREDIT_PROXY_ADDRESS: '0x0000000000000000000000000000000000000002',
  VOICE_CREDIT_PROXY_ABI: [],
}))

let mockPathname = '/'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/'
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
    renderWithProviders(<Header />)
    expect(screen.getByText('SIGIL')).toBeInTheDocument()
  })

  it('shows connect button when not connected', async () => {
    mockPathname = '/vote'
    renderWithProviders(<Header />)
    const connectButton = await screen.findByRole('button', { name: /connect|연결|sign in|로그인/i })
    expect(connectButton).toBeInTheDocument()
  })

  it('calls login when connect button is clicked', async () => {
    const user = userEvent.setup()
    mockPathname = '/vote'
    renderWithProviders(<Header />)
    const connectButton = await screen.findByRole('button', { name: /connect|연결|sign in|로그인/i })
    await user.click(connectButton)
    expect(mockLogin).toHaveBeenCalled()
  })

  it('shows shortened address when connected', async () => {
    mockPathname = '/vote'
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 11155111,
    }
    renderWithProviders(<Header />)
    expect(await screen.findByText('0x1234...5678')).toBeInTheDocument()
  })

  it('shows wrong network button when on wrong chain', async () => {
    mockPathname = '/vote'
    mockAccountState = {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
      chainId: 1, // mainnet, not sepolia
    }
    renderWithProviders(<Header />)
    expect(await screen.findByText(/Wrong Network|네트워크 변경/i)).toBeInTheDocument()
  })

  it('renders Vote nav as a link to /vote', () => {
    renderWithProviders(<Header />)
    const voteLink = screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/vote')
    expect(voteLink).toBeTruthy()
  })

  it('shows testnet badge', () => {
    renderWithProviders(<Header />)
    expect(screen.getByText(/Testnet|테스트넷/i)).toBeInTheDocument()
  })
})
