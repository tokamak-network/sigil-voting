import { describe, it, expect } from 'vitest';
import { SigilClient } from '../src/client.js';

describe('Governance Extensions', () => {
  describe('SigilClient governance methods exist', () => {
    it('has delegation methods', () => {
      expect(typeof SigilClient.prototype.delegate).toBe('function');
      expect(typeof SigilClient.prototype.undelegate).toBe('function');
      expect(typeof SigilClient.prototype.getDelegate).toBe('function');
      expect(typeof SigilClient.prototype.isDelegating).toBe('function');
    });

    it('has execution methods', () => {
      expect(typeof SigilClient.prototype.registerExecution).toBe('function');
      expect(typeof SigilClient.prototype.schedule).toBe('function');
      expect(typeof SigilClient.prototype.execute).toBe('function');
      expect(typeof SigilClient.prototype.cancelExecution).toBe('function');
      expect(typeof SigilClient.prototype.getExecutionState).toBe('function');
    });
  });

  describe('SigilConfig accepts governance addresses', () => {
    it('accepts timelockExecutorAddress', () => {
      // Should not throw with governance config
      const client = new SigilClient({
        maciAddress: '0x' + '1'.repeat(40),
        provider: {} as any,
        timelockExecutorAddress: '0x' + '2'.repeat(40),
        delegationRegistryAddress: '0x' + '3'.repeat(40),
      });
      expect(client).toBeDefined();
    });
  });

  describe('governance methods throw without config', () => {
    const client = new SigilClient({
      maciAddress: '0x' + '1'.repeat(40),
      provider: {} as any,
    });

    it('delegate throws without delegationRegistryAddress', async () => {
      await expect(client.delegate('0x' + '2'.repeat(40))).rejects.toThrow('delegationRegistryAddress not configured');
    });

    it('undelegate throws without delegationRegistryAddress', async () => {
      await expect(client.undelegate()).rejects.toThrow('delegationRegistryAddress not configured');
    });

    it('getDelegate throws without delegationRegistryAddress', async () => {
      await expect(client.getDelegate('0x' + '2'.repeat(40))).rejects.toThrow('delegationRegistryAddress not configured');
    });

    it('isDelegating throws without delegationRegistryAddress', async () => {
      await expect(client.isDelegating('0x' + '2'.repeat(40))).rejects.toThrow('delegationRegistryAddress not configured');
    });

    it('registerExecution throws without timelockExecutorAddress', async () => {
      await expect(client.registerExecution(0, '0x1', '0x2', '0x', 3600, 1)).rejects.toThrow('timelockExecutorAddress not configured');
    });

    it('schedule throws without timelockExecutorAddress', async () => {
      await expect(client.schedule(0)).rejects.toThrow('timelockExecutorAddress not configured');
    });

    it('execute throws without timelockExecutorAddress', async () => {
      await expect(client.execute(0)).rejects.toThrow('timelockExecutorAddress not configured');
    });

    it('cancelExecution throws without timelockExecutorAddress', async () => {
      await expect(client.cancelExecution(0)).rejects.toThrow('timelockExecutorAddress not configured');
    });

    it('getExecutionState throws without timelockExecutorAddress', async () => {
      await expect(client.getExecutionState(0)).rejects.toThrow('timelockExecutorAddress not configured');
    });
  });
});
