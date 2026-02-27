/**
 * E2E tests for SDK new features: event subscription, gasless voting,
 * getDelegators, getExecutionInfo.
 *
 * Uses mocked ethers contracts and fetch to verify full flows.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { SigilClient } from '../src/client.js';
import type { SigilEvent } from '../src/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

const MACI_ADDR = '0x' + '1'.repeat(40);
const POLL_ADDR = '0x' + 'A'.repeat(40);
const TIMELOCK_ADDR = '0x' + '2'.repeat(40);
const DELEGATION_ADDR = '0x' + '3'.repeat(40);
const VOTER_ADDR = '0x' + 'D'.repeat(40);

function makeMockProvider(overrides: Record<string, unknown> = {}) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(1000),
    getLogs: vi.fn().mockResolvedValue([]),
    call: vi.fn().mockResolvedValue('0x'),
    ...overrides,
  } as any;
}

// ─── Event Subscription E2E ─────────────────────────────────────────

describe('Event Subscription E2E', () => {
  it('cached signUp does not emit event', async () => {
    const events: SigilEvent[] = [];
    const provider = makeMockProvider();
    const signer = {
      getAddress: vi.fn().mockResolvedValue(VOTER_ADDR),
      signMessage: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
      provider,
    } as any;

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider,
      signer,
    });

    client.on('signup', (e) => events.push(e));

    // Pre-register user so signUp returns early (cached path)
    const km = client.getKeyManager();
    const sigBytes = new Uint8Array(65);
    sigBytes.fill(0xab);
    await km.getOrCreateKeypair(VOTER_ADDR, 0, sigBytes);
    km.markSignedUp(VOTER_ADDR, 1);

    const result = await client.signUp();
    expect(result.stateIndex).toBe(1);
    expect(events).toHaveLength(0);
  });

  it('registers and fires multiple listeners independently', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: makeMockProvider(),
    });

    const events1: SigilEvent[] = [];
    const events2: SigilEvent[] = [];
    const events3: SigilEvent[] = [];

    client.on('vote', (e) => events1.push(e));
    client.on('vote', (e) => events2.push(e));
    client.on('signup', (e) => events3.push(e));

    const emitFn = (client as any).emit.bind(client);
    emitFn('vote', { pollId: 0, txHash: '0xabc' });

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
    expect(events3).toHaveLength(0);

    expect(events1[0].type).toBe('vote');
    expect(events1[0].pollId).toBe(0);
    expect(events1[0].txHash).toBe('0xabc');
  });

  it('off() stops specific callback without affecting others', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: makeMockProvider(),
    });

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    client.on('keychange', cb1);
    client.on('keychange', cb2);
    client.off('keychange', cb1);

    (client as any).emit('keychange', { pollId: 1 });

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ type: 'keychange', pollId: 1 }));
  });

  it('emits all 4 event types correctly', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: makeMockProvider(),
    });

    const allEvents: SigilEvent[] = [];
    const handler = (e: SigilEvent) => allEvents.push(e);

    client.on('signup', handler);
    client.on('vote', handler);
    client.on('keychange', handler);
    client.on('finalized', handler);

    const emitFn = (client as any).emit.bind(client);
    emitFn('signup', { pollId: 0, txHash: '0x1' });
    emitFn('vote', { pollId: 1, txHash: '0x2', data: { choice: 'for' } });
    emitFn('keychange', { pollId: 2, txHash: '0x3' });
    emitFn('finalized', { pollId: 3 });

    expect(allEvents).toHaveLength(4);
    expect(allEvents.map(e => e.type)).toEqual(['signup', 'vote', 'keychange', 'finalized']);
    expect(allEvents[1].data).toEqual({ choice: 'for' });
  });
});

// ─── Gasless Voting E2E ─────────────────────────────────────────────

describe('Gasless Voting E2E', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST to relayerUrl when configured', async () => {
    const relayerUrl = 'https://relay.test.com';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txHash: '0x' + 'f'.repeat(64) }),
    });
    globalThis.fetch = fetchMock;

    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function polls(uint256) view returns (address)',
    ]);
    const encodedPollAddr = iface.encodeFunctionResult('polls', [POLL_ADDR]);

    // Share provider between provider and signer so ethers Contract resolves polls() correctly
    const sharedProvider = makeMockProvider({
      call: vi.fn().mockResolvedValue(encodedPollAddr),
    });
    const signer = {
      getAddress: vi.fn().mockResolvedValue(VOTER_ADDR),
      signMessage: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
      provider: sharedProvider,
    } as any;

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: sharedProvider,
      signer,
      relayerUrl,
      coordinatorPubKey: [1n, 2n],
    });

    const km = client.getKeyManager();
    const sigBytes = new Uint8Array(65);
    sigBytes.fill(0xab);
    await km.getOrCreateKeypair(VOTER_ADDR, 0, sigBytes);
    km.markSignedUp(VOTER_ADDR, 1);

    const events: SigilEvent[] = [];
    client.on('vote', (e) => events.push(e));

    const receipt = await client.vote(0, 'for', 2);

    // Verify fetch called with correct URL and body
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${relayerUrl}/api/relay/publish-message`);
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.pollAddress.toLowerCase()).toBe(POLL_ADDR.toLowerCase());
    expect(body.encMessage).toHaveLength(10);
    expect(body.encPubKeyX).toMatch(/^0x/);
    expect(body.encPubKeyY).toMatch(/^0x/);

    // Verify receipt
    expect(receipt.txHash).toBe('0x' + 'f'.repeat(64));
    expect(receipt.pollId).toBe(0);
    expect(receipt.choice).toBe('for');
    expect(receipt.numVotes).toBe(2);
    expect(receipt.creditsSpent).toBe(4);

    // Verify event emitted
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('vote');
    expect(events[0].txHash).toBe('0x' + 'f'.repeat(64));
  });

  it('throws on relay failure with status and error message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Invalid message format' }),
    });
    globalThis.fetch = fetchMock;

    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function polls(uint256) view returns (address)',
    ]);
    const encodedPollAddr = iface.encodeFunctionResult('polls', [POLL_ADDR]);

    const sharedProvider = makeMockProvider({
      call: vi.fn().mockResolvedValue(encodedPollAddr),
    });
    const signer = {
      getAddress: vi.fn().mockResolvedValue(VOTER_ADDR),
      signMessage: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
      provider: sharedProvider,
    } as any;

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: sharedProvider,
      signer,
      relayerUrl: 'https://relay.test.com',
      coordinatorPubKey: [1n, 2n],
    });

    const km = client.getKeyManager();
    const sigBytes = new Uint8Array(65);
    sigBytes.fill(0xab);
    await km.getOrCreateKeypair(VOTER_ADDR, 0, sigBytes);
    km.markSignedUp(VOTER_ADDR, 1);

    await expect(client.vote(0, 'for', 1)).rejects.toThrow('Relay failed (400)');
  });

  it('does not call fetch when relayerUrl is not configured', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function polls(uint256) view returns (address)',
    ]);
    const encodedPollAddr = iface.encodeFunctionResult('polls', [POLL_ADDR]);

    const sharedProvider = makeMockProvider({
      call: vi.fn().mockResolvedValue(encodedPollAddr),
    });
    const signer = {
      getAddress: vi.fn().mockResolvedValue(VOTER_ADDR),
      signMessage: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
      provider: sharedProvider,
    } as any;

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: sharedProvider,
      signer,
      coordinatorPubKey: [1n, 2n],
    });

    const km = client.getKeyManager();
    const sigBytes = new Uint8Array(65);
    sigBytes.fill(0xab);
    await km.getOrCreateKeypair(VOTER_ADDR, 0, sigBytes);
    km.markSignedUp(VOTER_ADDR, 1);

    // Without relayerUrl, vote() tries on-chain publishMessage which will fail
    // but fetch should NOT be called
    await expect(client.vote(0, 'for', 1)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── getDelegators E2E ──────────────────────────────────────────────

describe('getDelegators E2E', () => {
  it('returns delegators from contract call', async () => {
    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function getDelegators(address) view returns (address[])',
    ]);

    const delegators = [
      '0x' + 'a'.repeat(40),
      '0x' + 'b'.repeat(40),
    ];
    const encoded = iface.encodeFunctionResult('getDelegators', [delegators]);

    const provider = makeMockProvider({
      call: vi.fn().mockResolvedValue(encoded),
    });

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider,
      delegationRegistryAddress: DELEGATION_ADDR,
    });

    const result = await client.getDelegators('0x' + 'd'.repeat(40));
    expect(result).toHaveLength(2);
    expect(result[0].toLowerCase()).toBe('0x' + 'a'.repeat(40));
    expect(result[1].toLowerCase()).toBe('0x' + 'b'.repeat(40));
  });

  it('returns empty array when no delegators', async () => {
    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function getDelegators(address) view returns (address[])',
    ]);
    const encoded = iface.encodeFunctionResult('getDelegators', [[]]);

    const provider = makeMockProvider({
      call: vi.fn().mockResolvedValue(encoded),
    });

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider,
      delegationRegistryAddress: DELEGATION_ADDR,
    });

    const result = await client.getDelegators('0x' + 'd'.repeat(40));
    expect(result).toEqual([]);
  });

  it('uses signer address when delegate param is omitted', async () => {
    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function getDelegators(address) view returns (address[])',
    ]);
    const encoded = iface.encodeFunctionResult('getDelegators', [['0x' + 'e'.repeat(40)]]);

    const provider = makeMockProvider({
      call: vi.fn().mockResolvedValue(encoded),
    });
    const signer = {
      getAddress: vi.fn().mockResolvedValue(VOTER_ADDR),
      provider,
    } as any;

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider,
      signer,
      delegationRegistryAddress: DELEGATION_ADDR,
    });

    const result = await client.getDelegators();
    expect(result).toHaveLength(1);
    expect(signer.getAddress).toHaveBeenCalled();
  });
});

// ─── getExecutionInfo E2E ───────────────────────────────────────────

describe('getExecutionInfo E2E', () => {
  it('returns full execution info from contract', async () => {
    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function getExecution(uint256) view returns (address,address,address,bytes,uint256,uint256,uint256,uint8)',
    ]);

    const creator = '0x' + 'a'.repeat(40);
    const tallyAddr = '0x' + 'b'.repeat(40);
    const target = '0x' + 'c'.repeat(40);
    const callData = '0x12345678';

    const encoded = iface.encodeFunctionResult('getExecution', [
      creator,
      tallyAddr,
      target,
      callData,
      3600,    // timelockDelay
      100,     // quorum
      1700000, // scheduledAt
      2,       // state = scheduled
    ]);

    const provider = makeMockProvider({
      call: vi.fn().mockResolvedValue(encoded),
    });

    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider,
      timelockExecutorAddress: TIMELOCK_ADDR,
    });

    const info = await client.getExecutionInfo(5);

    expect(info.pollId).toBe(5);
    expect(info.creator.toLowerCase()).toBe(creator);
    expect(info.target.toLowerCase()).toBe(target);
    expect(info.callData).toBe(callData);
    expect(info.timelockDelay).toBe(3600);
    expect(info.quorum).toBe(100);
    expect(info.scheduledAt).toBe(1700000);
    expect(info.state).toBe('scheduled');
  });

  it('maps all execution states correctly', async () => {
    const { ethers } = await import('ethers');
    const iface = new ethers.Interface([
      'function getExecution(uint256) view returns (address,address,address,bytes,uint256,uint256,uint256,uint8)',
    ]);

    const states = ['none', 'registered', 'scheduled', 'executed', 'cancelled'] as const;

    for (let i = 0; i < states.length; i++) {
      const encoded = iface.encodeFunctionResult('getExecution', [
        '0x' + '0'.repeat(40),
        '0x' + '0'.repeat(40),
        '0x' + '0'.repeat(40),
        '0x',
        0, 0, 0, i,
      ]);

      const provider = makeMockProvider({
        call: vi.fn().mockResolvedValue(encoded),
      });

      const client = new SigilClient({
        maciAddress: MACI_ADDR,
        provider,
        timelockExecutorAddress: TIMELOCK_ADDR,
      });

      const info = await client.getExecutionInfo(0);
      expect(info.state).toBe(states[i]);
    }
  });
});
