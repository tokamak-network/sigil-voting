/**
 * Client Feature Tests
 *
 * Tests for event subscription, getDelegators, getExecutionInfo, and gasless config.
 */

import { describe, it, expect, vi } from 'vitest';
import { SigilClient } from '../src/client.js';
import type { SigilEvent } from '../src/types.js';

const MACI_ADDR = '0x' + '1'.repeat(40);
const TIMELOCK_ADDR = '0x' + '2'.repeat(40);
const DELEGATION_ADDR = '0x' + '3'.repeat(40);

describe('Event Subscription', () => {
  it('has on() and off() methods', () => {
    expect(typeof SigilClient.prototype.on).toBe('function');
    expect(typeof SigilClient.prototype.off).toBe('function');
  });

  it('on() registers a listener and off() removes it', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
    });

    const events: SigilEvent[] = [];
    const callback = (e: SigilEvent) => events.push(e);

    // Register listener
    client.on('vote', callback);

    // Remove listener — should not throw
    client.off('vote', callback);

    // Calling off() again should be harmless
    client.off('vote', callback);
  });

  it('off() does not throw for unregistered event type', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
    });

    const callback = (e: SigilEvent) => {};
    // Should not throw even if no listeners were ever added for 'signup'
    expect(() => client.off('signup', callback)).not.toThrow();
  });

  it('can register multiple listeners for same event', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
    });

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    client.on('vote', cb1);
    client.on('vote', cb2);

    // Both should be registered (we can't directly test emit since it's private,
    // but we verify no errors occur during registration)
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });

  it('can register listeners for different event types', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
    });

    const signupCb = vi.fn();
    const voteCb = vi.fn();
    const keyCb = vi.fn();
    const finCb = vi.fn();

    // Should not throw for any valid event type
    client.on('signup', signupCb);
    client.on('vote', voteCb);
    client.on('keychange', keyCb);
    client.on('finalized', finCb);

    // Clean up
    client.off('signup', signupCb);
    client.off('vote', voteCb);
    client.off('keychange', keyCb);
    client.off('finalized', finCb);
  });
});

describe('getDelegators', () => {
  it('has getDelegators method', () => {
    expect(typeof SigilClient.prototype.getDelegators).toBe('function');
  });

  it('throws without delegationRegistryAddress', async () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
    });

    await expect(client.getDelegators('0x' + 'a'.repeat(40)))
      .rejects.toThrow('delegationRegistryAddress not configured');
  });

  it('throws without address when no signer and no param', async () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
      delegationRegistryAddress: DELEGATION_ADDR,
    });

    await expect(client.getDelegators())
      .rejects.toThrow('No address provided');
  });
});

describe('getExecutionInfo', () => {
  it('has getExecutionInfo method', () => {
    expect(typeof SigilClient.prototype.getExecutionInfo).toBe('function');
  });

  it('throws without timelockExecutorAddress', async () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
    });

    await expect(client.getExecutionInfo(0))
      .rejects.toThrow('timelockExecutorAddress not configured');
  });
});

describe('Gasless voting config', () => {
  it('accepts relayerUrl in config', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
      relayerUrl: 'https://relay.example.com',
    });
    expect(client).toBeDefined();
  });

  it('works without relayerUrl (optional)', () => {
    const client = new SigilClient({
      maciAddress: MACI_ADDR,
      provider: {} as any,
    });
    expect(client).toBeDefined();
  });
});

describe('Salt generation with bitmask', () => {
  it('should produce salt within SNARK field using bitmask', async () => {
    const { generateSalt, SNARK_SCALAR_FIELD } = await import('../src/command.js');
    const salt = generateSalt();
    expect(salt).toBeGreaterThanOrEqual(0n);
    expect(salt).toBeLessThan(SNARK_SCALAR_FIELD);
    // Verify it fits in 253 bits
    expect(salt).toBeLessThanOrEqual((1n << 253n) - 1n);
  });

  it('should produce different salts each call', async () => {
    const { generateSalt } = await import('../src/command.js');
    const s1 = generateSalt();
    const s2 = generateSalt();
    expect(s1).not.toBe(s2);
  });
});
