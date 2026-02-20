import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'
import CreatePollForm from '../../src/components/CreatePollForm'

let mockAccountState = {
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
}

let mockCanCreate: unknown = undefined
let mockGateCount: unknown = 0n
let mockGateInfo: unknown = undefined
let mockTonBalance: unknown = undefined
let mockLoading = false

vi.mock('wagmi', () => ({
  useAccount: () => mockAccountState,
  usePublicClient: () => ({}),
  useReadContract: (config: any) => {
    if (config?.functionName === 'canCreatePoll') return { data: mockCanCreate, isLoading: mockLoading }
    if (config?.functionName === 'proposalGateCount') return { data: mockGateCount, isLoading: mockLoading }
    if (config?.functionName === 'proposalGates') return { data: mockGateInfo, isLoading: false }
    if (config?.functionName === 'balanceOf') return { data: mockTonBalance, isLoading: false }
    return { data: undefined, isLoading: false }
  },
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0x0000000000000000000000000000000000000001',
  TOKEN_ADDRESS: '0x0000000000000000000000000000000000000002',
  MSG_PROCESSOR_VERIFIER_ADDRESS: '0x0000000000000000000000000000000000000003',
  TALLY_VERIFIER_ADDRESS: '0x0000000000000000000000000000000000000004',
  VK_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000005',
  VOICE_CREDIT_PROXY_ADDRESS: '0x0000000000000000000000000000000000000006',
  MACI_ABI: [],
  DEFAULT_COORD_PUB_KEY_X: '0',
  DEFAULT_COORD_PUB_KEY_Y: '0',
  ERC20_VOICE_CREDIT_PROXY_ABI: [],
  ERC20_ABI: [],
}))

vi.mock('../../src/writeHelper', () => ({
  writeContract: vi.fn(),
}))

vi.mock('../../src/storageKeys', () => ({
  storageKey: vi.fn(() => 'test-key'),
}))

vi.mock('../../src/components/voting/TransactionModal', () => ({
  TransactionModal: () => <div data-testid="tx-modal">TransactionModal</div>,
}))

describe('CreatePollForm', () => {
  const onPollCreated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountState = { address: undefined, isConnected: false }
    mockCanCreate = undefined
    mockGateCount = 0n
    mockGateInfo = undefined
    mockTonBalance = undefined
    mockLoading = false
  })

  it('shows connect wallet message when not connected', () => {
    mockAccountState = { address: undefined, isConnected: false }
    renderWithProviders(<CreatePollForm onPollCreated={onPollCreated} />)
    const body = document.body.textContent || ''
    expect(body).toMatch(/지갑|wallet|connect/i)
  })

  it('shows loading state while checking eligibility', () => {
    mockAccountState = { address: '0x1234567890abcdef1234567890abcdef12345678', isConnected: true }
    mockLoading = true
    renderWithProviders(<CreatePollForm onPollCreated={onPollCreated} />)
    const body = document.body.textContent || ''
    expect(body).toMatch(/확인|checking|loading/i)
  })

  it('renders the form when connected and eligible', () => {
    mockAccountState = { address: '0x1234567890abcdef1234567890abcdef12345678', isConnected: true }
    mockCanCreate = true
    mockGateCount = 0n // no gates = anyone can create
    mockLoading = false
    renderWithProviders(<CreatePollForm onPollCreated={onPollCreated} />)
    // Should render form with title input or duration presets
    const body = document.body.textContent || ''
    expect(body).toMatch(/제목|title|제안|proposal|기간|duration/i)
  })
})
