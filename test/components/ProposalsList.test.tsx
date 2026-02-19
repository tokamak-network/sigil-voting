import { describe, it, expect, vi } from 'vitest'

// ProposalsList has heavy async side effects (publicClient.getLogs, readContract loops)
// that cause worker timeouts. Tested via Playwright E2E instead.

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  usePublicClient: () => null,
  useReadContract: () => ({ data: undefined }),
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0x0000000000000000000000000000000000000000',
  MACI_DEPLOY_BLOCK: 0n,
  MACI_ABI: [],
  POLL_ABI: [],
  TALLY_ABI: [],
}))

vi.mock('../../src/storageKeys', () => ({
  storageKey: { pollsCache: 'test-polls-cache' },
}))

vi.mock('../../src/components/CreatePollForm', () => ({
  CreatePollForm: () => null,
}))

describe('ProposalsList', () => {
  it('module loads without error', async () => {
    const mod = await import('../../src/components/ProposalsList')
    expect(mod.ProposalsList).toBeDefined()
  })
})
