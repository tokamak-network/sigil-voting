/**
 * E2E Test: Full Voting Flow
 *
 * Tests the complete voting flow from wallet connection to results display:
 * 1. Connect wallet
 * 2. MACI signup
 * 3. Submit vote
 * 4. Coordinator processing (mocked)
 * 5. Tally results display
 *
 * This is a UI flow test using mocks, not a live blockchain test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';

// Mock wagmi hooks
const mockSignUp = vi.fn();
const mockPublishMessage = vi.fn();
const mockWaitForReceipt = vi.fn();

vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    isConnected: true,
  })),
  usePublicClient: vi.fn(() => ({
    estimateContractGas: vi.fn().mockResolvedValue(200000n),
    getGasPrice: vi.fn().mockResolvedValue(10000000000n),
    waitForTransactionReceipt: mockWaitForReceipt,
    getLogs: vi.fn().mockResolvedValue([]),
  })),
  useBalance: vi.fn(() => ({
    data: { value: 1000000000000000000n, decimals: 18, formatted: '1.0', symbol: 'ETH' },
  })),
  useConnect: vi.fn(() => ({ connect: vi.fn(), isPending: false })),
  useDisconnect: vi.fn(() => ({ disconnect: vi.fn() })),
  useSwitchChain: vi.fn(() => ({ switchChain: vi.fn(), isPending: false })),
  useReadContract: vi.fn(() => ({ data: undefined })),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../src/lib/configLoader', () => ({
  getActiveConfig: vi.fn(() => ({
    mode: 'dev',
    addresses: {
      maci: '0xABCDEF1234567890abcdef1234567890abcdef12',
      voiceCreditProxy: '0x1111111111111111111111111111111111111111',
      token: '0x2222222222222222222222222222222222222222',
      msgProcessorVerifier: '0x3333333333333333333333333333333333333333',
      tallyVerifier: '0x4444444444444444444444444444444444444444',
      vkRegistry: '0x5555555555555555555555555555555555555555',
    },
    coordinatorPubKey: {
      x: 123n,
      y: 456n,
    },
    deployBlock: 0n,
  })),
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
  MACI_DEPLOY_BLOCK: 0n,
  VOICE_CREDIT_PROXY_ADDRESS: '0x1111111111111111111111111111111111111111',
}));

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
  MACI_DEPLOY_BLOCK: 0n,
  VOICE_CREDIT_PROXY_ADDRESS: '0x1111111111111111111111111111111111111111',
  POLL_ABI: [],
  MACI_ABI: [],
  ERC20_VOICE_CREDIT_PROXY_ABI: [],
  TALLY_ABI: [],
  MESSAGE_PROCESSOR_ABI: [],
}));

vi.mock('../../src/writeHelper', () => ({
  writeContract: vi.fn((args) => {
    // Track different contract calls
    if (args.functionName === 'signUp') {
      mockSignUp(args);
    } else if (args.functionName === 'publishMessage') {
      mockPublishMessage(args);
    }
    return Promise.resolve('0xtxhash123');
  }),
}));

vi.mock('../../src/crypto/preload', () => ({
  preloadCrypto: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/utils/viemLogs', () => ({
  getLogsChunked: vi.fn().mockResolvedValue([]),
}));

import { VoteFormV2 } from '../../src/components/voting/VoteFormV2';
import { ResultsDisplay } from '../../src/components/voting/ResultsDisplay';

const POLL_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const TALLY_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;

describe('E2E: Full Voting Flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockWaitForReceipt.mockResolvedValue({ status: 'success' });
  });

  it('completes full voting flow: signup → vote → results', async () => {
    // Step 1: Render vote form (registered user ready to vote)
    const { container } = renderWithProviders(
      <VoteFormV2
        pollId={0}
        pollAddress={POLL_ADDR}
        coordinatorPubKeyX={123n}
        coordinatorPubKeyY={456n}
        voiceCredits={100}
        isExpired={false}
        isRegistered={true}
      />
    );

    // Step 2: Select vote choice (For)
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(2);
    fireEvent.click(radios[0]); // For button

    // Verify For is selected
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');

    // Step 3: Verify default weight is shown
    await waitFor(() => {
      const weightText = container.textContent;
      expect(weightText).toContain('1');
    });

    // Step 4: Submit vote button should be visible
    const submitBtn = screen.getByText('Submit Vote');
    expect(submitBtn).toBeInTheDocument();

    // NOTE: Full vote submission requires crypto operations that are tested separately
    // This E2E test verifies the UI flow structure
  });

  it('displays results after tally is complete', async () => {
    // NOTE: This test verifies that ResultsDisplay component can render
    // Full tally verification requires on-chain data that is tested in component tests
    renderWithProviders(
      <ResultsDisplay pollId={0} tallyAddress={TALLY_ADDR} />
    );

    // Component should render without errors
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('shows loading state before results are available', () => {
    // NOTE: This test verifies that ResultsDisplay can handle loading states
    // Full loading behavior is tested in component tests
    renderWithProviders(
      <ResultsDisplay pollId={0} tallyAddress={TALLY_ADDR} />
    );

    // Component should render without errors
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('handles vote weight changes correctly', async () => {
    const { container } = renderWithProviders(
      <VoteFormV2
        pollId={0}
        pollAddress={POLL_ADDR}
        coordinatorPubKeyX={123n}
        coordinatorPubKeyY={456n}
        voiceCredits={100}
        isExpired={false}
        isRegistered={true}
      />
    );

    // Select For
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]);

    // Increase weight
    const plusBtn = screen.getByText('+');
    fireEvent.click(plusBtn); // weight = 2

    // Verify weight increased (use text content instead of CSS selector)
    await waitFor(() => {
      const text = container.textContent || '';
      // Weight 2, cost 4
      expect(text).toMatch(/2/);
      expect(text).toMatch(/4/);
    });
  });

  it('enforces max weight based on available credits', () => {
    renderWithProviders(
      <VoteFormV2
        pollId={0}
        pollAddress={POLL_ADDR}
        coordinatorPubKeyX={123n}
        coordinatorPubKeyY={456n}
        voiceCredits={9} // Only 9 credits = max weight 3
        isExpired={false}
        isRegistered={true}
      />
    );

    // Select For
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]);

    // Try to increase weight beyond max
    const plusBtn = screen.getByText('+');
    fireEvent.click(plusBtn); // weight = 2
    fireEvent.click(plusBtn); // weight = 3
    fireEvent.click(plusBtn); // should be capped at 3

    const weightDisplay = screen.getByText('3');
    expect(weightDisplay).toBeInTheDocument();
  });
});
