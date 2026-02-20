/**
 * Command Packing Tests
 */

import { describe, it, expect } from 'vitest';
import {
  packCommand,
  unpackCommand,
  computeCommandHash,
  generateSalt,
  SNARK_SCALAR_FIELD,
} from '../src/command.js';

describe('packCommand', () => {
  it('should pack and unpack identity (all zeros except stateIndex)', () => {
    const packed = packCommand(1n, 0n, 0n, 0n, 0n);
    const unpacked = unpackCommand(packed);
    expect(unpacked.stateIndex).toBe(1n);
    expect(unpacked.voteOptionIndex).toBe(0n);
    expect(unpacked.newVoteWeight).toBe(0n);
    expect(unpacked.nonce).toBe(0n);
    expect(unpacked.pollId).toBe(0n);
  });

  it('should roundtrip all fields', () => {
    const packed = packCommand(7n, 1n, 3n, 2n, 5n);
    const unpacked = unpackCommand(packed);
    expect(unpacked.stateIndex).toBe(7n);
    expect(unpacked.voteOptionIndex).toBe(1n);
    expect(unpacked.newVoteWeight).toBe(3n);
    expect(unpacked.nonce).toBe(2n);
    expect(unpacked.pollId).toBe(5n);
  });

  it('should handle large state index (50 bits)', () => {
    const maxVal = (1n << 50n) - 1n;
    const packed = packCommand(maxVal, 0n, 0n, 0n, 0n);
    const unpacked = unpackCommand(packed);
    expect(unpacked.stateIndex).toBe(maxVal);
  });

  it('should handle max values in all fields', () => {
    const maxVal = (1n << 50n) - 1n;
    const packed = packCommand(maxVal, maxVal, maxVal, maxVal, maxVal);
    const unpacked = unpackCommand(packed);
    expect(unpacked.stateIndex).toBe(maxVal);
    expect(unpacked.voteOptionIndex).toBe(maxVal);
    expect(unpacked.newVoteWeight).toBe(maxVal);
    expect(unpacked.nonce).toBe(maxVal);
    expect(unpacked.pollId).toBe(maxVal);
  });

  it('should produce different packed values for different inputs', () => {
    const p1 = packCommand(1n, 1n, 1n, 1n, 1n);
    const p2 = packCommand(1n, 0n, 1n, 1n, 1n);
    expect(p1).not.toBe(p2);
  });

  it('should correctly pack key change command (option=0, weight=0)', () => {
    const packed = packCommand(5n, 0n, 0n, 1n, 3n);
    const unpacked = unpackCommand(packed);
    expect(unpacked.stateIndex).toBe(5n);
    expect(unpacked.voteOptionIndex).toBe(0n);
    expect(unpacked.newVoteWeight).toBe(0n);
    expect(unpacked.nonce).toBe(1n);
    expect(unpacked.pollId).toBe(3n);
  });
});

describe('computeCommandHash', () => {
  it('should produce a deterministic hash', async () => {
    const h1 = await computeCommandHash(1n, 100n, 200n, 3n, 42n);
    const h2 = await computeCommandHash(1n, 100n, 200n, 3n, 42n);
    expect(h1).toBe(h2);
  });

  it('should produce different hashes for different inputs', async () => {
    const h1 = await computeCommandHash(1n, 100n, 200n, 3n, 42n);
    const h2 = await computeCommandHash(1n, 100n, 200n, 3n, 43n);
    expect(h1).not.toBe(h2);
  });

  it('should produce hash within SNARK field', async () => {
    const h = await computeCommandHash(1n, 100n, 200n, 3n, 42n);
    expect(h).toBeGreaterThan(0n);
    expect(h).toBeLessThan(SNARK_SCALAR_FIELD);
  });
});

describe('generateSalt', () => {
  it('should produce salt within SNARK field', () => {
    const salt = generateSalt();
    expect(salt).toBeGreaterThanOrEqual(0n);
    expect(salt).toBeLessThan(SNARK_SCALAR_FIELD);
  });

  it('should produce different salts', () => {
    const s1 = generateSalt();
    const s2 = generateSalt();
    expect(s1).not.toBe(s2);
  });
});
