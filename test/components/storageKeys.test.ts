/**
 * storageKeys.test.ts - localStorage key scoping tests
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
}))

import { storageKey } from '../../src/storageKeys'

const ADDR = '0x1234567890abcdef1234567890abcdef12345678'

describe('storageKey', () => {
  it('includes contract address prefix for scoping', () => {
    const key = storageKey.signup(ADDR)
    expect(key).toContain('maci-ABCDEF')
  })

  it('generates unique keys per address', () => {
    const addr2 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    expect(storageKey.signup(ADDR)).not.toBe(storageKey.signup(addr2))
  })

  it('generates unique keys per pollId', () => {
    expect(storageKey.nonce(ADDR, 0)).not.toBe(storageKey.nonce(ADDR, 1))
  })

  it('pk key includes address', () => {
    expect(storageKey.pk(ADDR)).toContain(ADDR)
  })

  it('pubkey key includes address and pollId', () => {
    const key = storageKey.pubkey(ADDR, 3)
    expect(key).toContain(ADDR)
    expect(key).toContain('3')
  })

  it('nonce key is scoped', () => {
    expect(storageKey.nonce(ADDR, 0)).toContain('nonce')
    expect(storageKey.nonce(ADDR, 0)).toContain(ADDR)
  })

  it('lastVote key is scoped', () => {
    expect(storageKey.lastVote(ADDR, 1)).toContain('lastVote')
  })

  it('creditsSpent key is scoped', () => {
    expect(storageKey.creditsSpent(ADDR, 2)).toContain('creditsSpent')
  })

  it('stateIndex key is global (no pollId)', () => {
    expect(storageKey.stateIndex(ADDR)).toContain('stateIndex')
    expect(storageKey.stateIndex(ADDR)).not.toContain('undefined')
  })

  it('stateIndexPoll key includes pollId', () => {
    expect(storageKey.stateIndexPoll(ADDR, 5)).toContain('5')
  })

  it('pollTitle key includes pollId', () => {
    expect(storageKey.pollTitle(0)).toContain('poll-title-0')
  })

  it('pollDesc key includes pollId', () => {
    expect(storageKey.pollDesc(1)).toContain('poll-desc-1')
  })

  it('pollsCache is a fixed string', () => {
    expect(typeof storageKey.pollsCache).toBe('string')
    expect(storageKey.pollsCache).toContain('polls-cache')
  })
})
