import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'
import { ExecutionPanel } from '../../src/components/governance/ExecutionPanel'

const mockWriteContract = vi.fn()

let mockGetState: unknown = 0
let mockCanSchedule: unknown = false
let mockCanExecute: unknown = false
let mockExecutionData: unknown = undefined

vi.mock('wagmi', () => ({
  useReadContract: (config: any) => {
    if (config?.functionName === 'getState')
      return { data: mockGetState, isLoading: false }
    if (config?.functionName === 'canSchedule')
      return { data: mockCanSchedule, isLoading: false }
    if (config?.functionName === 'canExecute')
      return { data: mockCanExecute, isLoading: false }
    if (config?.functionName === 'getExecution')
      return { data: mockExecutionData, isLoading: false }
    return { data: undefined, isLoading: false }
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
  TIMELOCK_EXECUTOR_ADDRESS: '0x0000000000000000000000000000000000000001',
  TIMELOCK_EXECUTOR_ABI: [],
}))

describe('ExecutionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetState = 0
    mockCanSchedule = false
    mockCanExecute = false
    mockExecutionData = undefined
  })

  it('renders nothing when state is None (0)', () => {
    mockGetState = 0
    const { container } = renderWithProviders(<ExecutionPanel pollId={0} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows registered state with schedule button', () => {
    mockGetState = 1 // Registered
    mockCanSchedule = true
    mockExecutionData = [
      '0x0000000000000000000000000000000000000001', // creator
      '0x0000000000000000000000000000000000000002', // tallyAddr
      '0x0000000000000000000000000000000000000003', // target
      '0x', // callData
      3600n, // timelockDelay
      1n, // quorum
      0n, // scheduledAt
      1, // state
    ]
    renderWithProviders(<ExecutionPanel pollId={0} />)
    expect(screen.getByText(/On-Chain Execution|온체인 실행/i)).toBeInTheDocument()
    const registeredElements = screen.getAllByText(/Registered|등록됨/i)
    expect(registeredElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Schedule Execution|실행 예약/i)).toBeInTheDocument()
  })

  it('shows scheduled state', () => {
    mockGetState = 2 // Scheduled
    mockCanExecute = false
    mockExecutionData = [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',
      '0x',
      3600n,
      1n,
      BigInt(Math.floor(Date.now() / 1000)),
      2,
    ]
    renderWithProviders(<ExecutionPanel pollId={0} />)
    const scheduledElements = screen.getAllByText(/Scheduled|예약됨/i)
    expect(scheduledElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows executed state', () => {
    mockGetState = 3 // Executed
    mockExecutionData = [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',
      '0x',
      3600n,
      1n,
      BigInt(Math.floor(Date.now() / 1000) - 7200),
      3,
    ]
    renderWithProviders(<ExecutionPanel pollId={0} />)
    const executedElements = screen.getAllByText(/Executed|실행됨/i)
    expect(executedElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows cancelled state', () => {
    mockGetState = 4 // Cancelled
    mockExecutionData = [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',
      '0x',
      3600n,
      1n,
      0n,
      4,
    ]
    renderWithProviders(<ExecutionPanel pollId={0} />)
    const cancelledElements = screen.getAllByText(/Cancelled|취소됨/i)
    expect(cancelledElements.length).toBeGreaterThanOrEqual(1)
  })
})
