/**
 * Storage Interface Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage, createDefaultStorage } from '../src/storage.js';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('should return null for non-existent key', () => {
    expect(storage.getItem('missing')).toBeNull();
  });

  it('should store and retrieve a value', () => {
    storage.setItem('key1', 'value1');
    expect(storage.getItem('key1')).toBe('value1');
  });

  it('should overwrite existing value', () => {
    storage.setItem('key1', 'value1');
    storage.setItem('key1', 'value2');
    expect(storage.getItem('key1')).toBe('value2');
  });

  it('should remove a value', () => {
    storage.setItem('key1', 'value1');
    storage.removeItem('key1');
    expect(storage.getItem('key1')).toBeNull();
  });

  it('should handle removing non-existent key without error', () => {
    expect(() => storage.removeItem('missing')).not.toThrow();
  });

  it('should store multiple keys independently', () => {
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    storage.setItem('c', '3');
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('b')).toBe('2');
    expect(storage.getItem('c')).toBe('3');
  });

  it('should report correct size', () => {
    expect(storage.size).toBe(0);
    storage.setItem('a', '1');
    expect(storage.size).toBe(1);
    storage.setItem('b', '2');
    expect(storage.size).toBe(2);
  });

  it('should clear all items', () => {
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    storage.clear();
    expect(storage.size).toBe(0);
    expect(storage.getItem('a')).toBeNull();
  });

  it('should handle empty string values', () => {
    storage.setItem('empty', '');
    expect(storage.getItem('empty')).toBe('');
  });

  it('should handle special characters in keys', () => {
    storage.setItem('maci-abc123-signup-0xdeadbeef', 'yes');
    expect(storage.getItem('maci-abc123-signup-0xdeadbeef')).toBe('yes');
  });

  it('should handle large values', () => {
    const largeValue = 'x'.repeat(10000);
    storage.setItem('large', largeValue);
    expect(storage.getItem('large')).toBe(largeValue);
  });

  it('should handle JSON values', () => {
    const obj = { pk: ['123', '456'] };
    storage.setItem('json', JSON.stringify(obj));
    expect(JSON.parse(storage.getItem('json')!)).toEqual(obj);
  });

  it('should handle bigint string values', () => {
    const bigStr = '2736030358979909402780800718157159386076813972158567259200215660948447373041';
    storage.setItem('big', bigStr);
    expect(BigInt(storage.getItem('big')!)).toBe(BigInt(bigStr));
  });
});

describe('createDefaultStorage', () => {
  it('should return a storage implementation', () => {
    const storage = createDefaultStorage();
    expect(storage).toBeDefined();
    expect(typeof storage.getItem).toBe('function');
    expect(typeof storage.setItem).toBe('function');
    expect(typeof storage.removeItem).toBe('function');
  });

  it('should work for basic operations', () => {
    const storage = createDefaultStorage();
    storage.setItem('test', 'value');
    expect(storage.getItem('test')).toBe('value');
    storage.removeItem('test');
    expect(storage.getItem('test')).toBeNull();
  });
});
