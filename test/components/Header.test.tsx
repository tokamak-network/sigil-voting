import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../helpers/render'
import { Header } from '../../src/components/Header'

// Mock wagmi hooks
const mockDisconnect = vi.fn()
const mockSwitchChain = vi.fn()
const mockConnect = vi.fn()

let mockAccountState = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  chainId: 11155111 as number | undefined,
}

vi.mock('wagmi', () => ({
  useAccount: () => mockAccountState,
  useConnect: () => ({ connect: mockConnect, isPending: false }),
  useDisconnect: () => ({ disconnect: mockDisconnect }),
  useSwitchChain: () => ({ switchChain: mockSwitchChain, isPending: false }),
  useReadContract: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('@wagmi/core', () => ({
  injected: () => 'injected-connector',
}))

vi.mock('../../src/wagmi', () => ({
  sepolia: { id: 11155111 },
  isPrivyEnabled: false,
}))

// Mock usePrivySafe (returns no-ops since isPrivyEnabled=false)
const mockLogin = vi.fn()
const mockLogout = vi.fn()

vi.mock('../../src/hooks/usePrivySafe', () => ({
  usePrivySafe: () => ({
    login: mockLogin,
    logout: mockLogout,
    authenticated: false,
    ready: true,
  }),
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

  it('calls connect when connect button is clicked (MetaMask mode)', async () => {
    const user = userEvent.setup()
    mockPathname = '/vote'
    renderWithProviders(<Header />)
    const connectButton = await screen.findByRole('button', { name: /connect|연결|sign in|로그인/i })
    await user.click(connectButton)
    // isPrivyEnabled is false, so it should call wagmi connect
    expect(mockConnect).toHaveBeenCalled()
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
      chainId: 1,
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
