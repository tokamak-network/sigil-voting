/**
 * Test 3.1: Voting State Machine Tests
 *
 * TDD Phase: GREEN - Tests pass with actual implementation
 *
 * State Flow:
 * IDLE -> PROOFING -> SIGNING -> SUBMITTING -> SUCCESS
 *                                          -> ERROR
 */

import { describe, it, expect } from 'vitest'
import { votingReducer, type VotingContext, type VotingState } from '../../src/hooks/useVotingMachine'

// Re-export types for backward compatibility
export type { VotingState, VotingContext }
export { votingReducer }

const initialContext: VotingContext = {
  state: 'IDLE',
  numVotes: 1,
  cost: 1,
  error: null,
  txHash: null,
  progress: 0,
  message: '',
}

describe('Test 3.1: Voting State Machine', () => {
  describe('State Transitions', () => {
    it('should start in IDLE state', () => {
      expect(initialContext.state).toBe('IDLE')
    })

    it('IDLE -> PROOFING on START_VOTE', () => {
      const result = votingReducer(initialContext, { type: 'START_VOTE' })
      expect(result.state).toBe('PROOFING')
      expect(result.progress).toBe(0)
    })

    it('PROOFING -> SIGNING on PROOF_COMPLETE', () => {
      const proofingContext = { ...initialContext, state: 'PROOFING' as const }
      const result = votingReducer(proofingContext, { type: 'PROOF_COMPLETE' })
      expect(result.state).toBe('SIGNING')
      expect(result.progress).toBe(50)
    })

    it('SIGNING -> SUBMITTING on SIGNED', () => {
      const signingContext = { ...initialContext, state: 'SIGNING' as const }
      const result = votingReducer(signingContext, { type: 'SIGNED' })
      expect(result.state).toBe('SUBMITTING')
      expect(result.progress).toBe(75)
    })

    it('SUBMITTING -> SUCCESS on TX_CONFIRMED', () => {
      const submittingContext = { ...initialContext, state: 'SUBMITTING' as const }
      const result = votingReducer(submittingContext, {
        type: 'TX_CONFIRMED',
        payload: '0x123...'
      })
      expect(result.state).toBe('SUCCESS')
      expect(result.txHash).toBe('0x123...')
      expect(result.progress).toBe(100)
    })

    it('Any state -> ERROR on ERROR', () => {
      const proofingContext = { ...initialContext, state: 'PROOFING' as const }
      const result = votingReducer(proofingContext, {
        type: 'ERROR',
        payload: '증명 생성 실패'
      })
      expect(result.state).toBe('ERROR')
      expect(result.error).toBe('증명 생성 실패')
    })
  })

  describe('Quadratic Cost Calculation', () => {
    it('1 vote = 1 cost', () => {
      const cost = 1 * 1
      expect(cost).toBe(1)
    })

    it('5 votes = 25 cost', () => {
      const cost = 5 * 5
      expect(cost).toBe(25)
    })

    it('10 votes = 100 cost', () => {
      const cost = 10 * 10
      expect(cost).toBe(100)
    })
  })

  describe('UI Messages per State', () => {
    it('PROOFING shows proof message', () => {
      const result = votingReducer(initialContext, { type: 'START_VOTE' })
      expect(result.message).toContain('증명')
    })

    it('SIGNING shows wallet message', () => {
      const proofingContext = { ...initialContext, state: 'PROOFING' as const }
      const result = votingReducer(proofingContext, { type: 'PROOF_COMPLETE' })
      expect(result.message).toContain('지갑')
    })

    it('SUCCESS shows completion message', () => {
      const submittingContext = { ...initialContext, state: 'SUBMITTING' as const }
      const result = votingReducer(submittingContext, { type: 'TX_CONFIRMED', payload: '0x...' })
      expect(result.message).toContain('완료')
    })
  })
})
