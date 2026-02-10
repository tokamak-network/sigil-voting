/**
 * Voting State Machine Hook
 *
 * State Flow:
 * IDLE -> PROOFING -> SIGNING -> SUBMITTING -> SUCCESS
 *                                           -> ERROR
 */

import { useReducer, useCallback } from 'react'

export type VotingState =
  | 'IDLE'
  | 'PROOFING'
  | 'SIGNING'
  | 'SUBMITTING'
  | 'SUCCESS'
  | 'ERROR'

export interface VotingContext {
  state: VotingState
  numVotes: number
  cost: number
  error: string | null
  txHash: string | null
  progress: number
  message: string
}

type VotingAction =
  | { type: 'SET_VOTES'; payload: number }
  | { type: 'START_VOTE' }
  | { type: 'UPDATE_PROGRESS'; payload: { progress: number; message: string } }
  | { type: 'PROOF_COMPLETE' }
  | { type: 'SIGNED' }
  | { type: 'TX_CONFIRMED'; payload: string }
  | { type: 'ERROR'; payload: string }
  | { type: 'RESET' }

const initialContext: VotingContext = {
  state: 'IDLE',
  numVotes: 1,
  cost: 1,
  error: null,
  txHash: null,
  progress: 0,
  message: '',
}

export function votingReducer(
  context: VotingContext,
  action: VotingAction
): VotingContext {
  switch (action.type) {
    case 'SET_VOTES': {
      const numVotes = action.payload
      return { ...context, numVotes, cost: numVotes * numVotes }
    }

    case 'START_VOTE':
      return {
        ...context,
        state: 'PROOFING',
        progress: 0,
        message: 'ZK 증명 생성 중...',
        error: null,
      }

    case 'UPDATE_PROGRESS':
      return {
        ...context,
        progress: action.payload.progress,
        message: action.payload.message,
      }

    case 'PROOF_COMPLETE':
      return {
        ...context,
        state: 'SIGNING',
        progress: 50,
        message: '지갑 서명 대기 중...',
      }

    case 'SIGNED':
      return {
        ...context,
        state: 'SUBMITTING',
        progress: 75,
        message: '블록체인에 제출 중...',
      }

    case 'TX_CONFIRMED':
      return {
        ...context,
        state: 'SUCCESS',
        progress: 100,
        message: '투표 완료!',
        txHash: action.payload,
      }

    case 'ERROR':
      return {
        ...context,
        state: 'ERROR',
        error: action.payload,
      }

    case 'RESET':
      return { ...initialContext, numVotes: context.numVotes, cost: context.numVotes * context.numVotes }

    default:
      return context
  }
}

export function useVotingMachine() {
  const [context, dispatch] = useReducer(votingReducer, initialContext)

  const setVotes = useCallback((numVotes: number) => {
    dispatch({ type: 'SET_VOTES', payload: numVotes })
  }, [])

  const startVote = useCallback(() => {
    dispatch({ type: 'START_VOTE' })
  }, [])

  const updateProgress = useCallback((progress: number, message: string) => {
    dispatch({ type: 'UPDATE_PROGRESS', payload: { progress, message } })
  }, [])

  const proofComplete = useCallback(() => {
    dispatch({ type: 'PROOF_COMPLETE' })
  }, [])

  const signed = useCallback(() => {
    dispatch({ type: 'SIGNED' })
  }, [])

  const txConfirmed = useCallback((txHash: string) => {
    dispatch({ type: 'TX_CONFIRMED', payload: txHash })
  }, [])

  const setError = useCallback((error: string) => {
    dispatch({ type: 'ERROR', payload: error })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  const isProcessing = context.state !== 'IDLE' && context.state !== 'SUCCESS' && context.state !== 'ERROR'

  return {
    context,
    isProcessing,
    setVotes,
    startVote,
    updateProgress,
    proofComplete,
    signed,
    txConfirmed,
    setError,
    reset,
  }
}
