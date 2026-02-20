/**
 * voteUtils.test.ts - MACI nonce & vote history logic tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock contractV2 before importing storageKeys (which imports MACI_V2_ADDRESS)
vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
}))

import { getLastVote, getMaciNonce, incrementMaciNonce } from '../../src/components/voting/voteUtils'
import { storageKey } from '../../src/storageKeys'

const ADDR = '0x1234567890abcdef1234567890abcdef12345678'
const POLL = 0

describe('voteUtils', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getMaciNonce', () => {
    it('returns 1 by default (first message)', () => {
      expect(getMaciNonce(ADDR, POLL)).toBe(1)
    })

    it('returns stored nonce value', () => {
      localStorage.setItem(storageKey.nonce(ADDR, POLL), '3')
      expect(getMaciNonce(ADDR, POLL)).toBe(3)
    })

    it('is scoped per address', () => {
      const addr2 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      localStorage.setItem(storageKey.nonce(ADDR, POLL), '5')
      expect(getMaciNonce(addr2, POLL)).toBe(1)
    })

    it('is scoped per pollId', () => {
      localStorage.setItem(storageKey.nonce(ADDR, 0), '5')
      expect(getMaciNonce(ADDR, 1)).toBe(1)
    })
  })

  describe('incrementMaciNonce', () => {
    it('increments from default 1 to 2', () => {
      incrementMaciNonce(ADDR, POLL)
      expect(getMaciNonce(ADDR, POLL)).toBe(2)
    })

    it('increments consecutively', () => {
      incrementMaciNonce(ADDR, POLL)
      incrementMaciNonce(ADDR, POLL)
      incrementMaciNonce(ADDR, POLL)
      expect(getMaciNonce(ADDR, POLL)).toBe(4)
    })

    it('does not affect other addresses', () => {
      const addr2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      incrementMaciNonce(ADDR, POLL)
      expect(getMaciNonce(addr2, POLL)).toBe(1)
    })
  })

  describe('getLastVote', () => {
    it('returns null when no vote stored', () => {
      expect(getLastVote(ADDR, POLL)).toBeNull()
    })

    it('returns stored vote object', () => {
      localStorage.setItem(
        storageKey.lastVote(ADDR, POLL),
        JSON.stringify({ choice: 1, weight: 3, cost: 9 }),
      )
      expect(getLastVote(ADDR, POLL)).toEqual({ choice: 1, weight: 3, cost: 9 })
    })

    it('returns null for malformed JSON', () => {
      localStorage.setItem(storageKey.lastVote(ADDR, POLL), 'not-json')
      expect(getLastVote(ADDR, POLL)).toBeNull()
    })

    it('returns null for incomplete data', () => {
      localStorage.setItem(
        storageKey.lastVote(ADDR, POLL),
        JSON.stringify({ choice: 1 }),
      )
      expect(getLastVote(ADDR, POLL)).toBeNull()
    })

    it('returns null for wrong types', () => {
      localStorage.setItem(
        storageKey.lastVote(ADDR, POLL),
        JSON.stringify({ choice: 'for', weight: 1, cost: 1 }),
      )
      expect(getLastVote(ADDR, POLL)).toBeNull()
    })

    it('is scoped per address and pollId', () => {
      localStorage.setItem(
        storageKey.lastVote(ADDR, 0),
        JSON.stringify({ choice: 1, weight: 2, cost: 4 }),
      )
      expect(getLastVote(ADDR, 1)).toBeNull()
      expect(getLastVote('0xother', 0)).toBeNull()
    })
  })

  describe('hasVoted detection (nonce > 1)', () => {
    it('hasVoted is false when nonce is 1', () => {
      expect(getMaciNonce(ADDR, POLL) > 1).toBe(false)
    })

    it('hasVoted is true after incrementing', () => {
      incrementMaciNonce(ADDR, POLL)
      expect(getMaciNonce(ADDR, POLL) > 1).toBe(true)
    })
  })
})
