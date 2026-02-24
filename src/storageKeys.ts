/**
 * localStorage key generator scoped to MACI contract address.
 * Prevents data collision when contract is redeployed.
 */
import { MACI_V2_ADDRESS } from './contractV2'

const PREFIX = `maci-${MACI_V2_ADDRESS.slice(2, 8)}`

export const storageKey = {
  signup: (addr: string) => `${PREFIX}-signup-${addr}`,
  pk: (addr: string) => `${PREFIX}-pk-${addr}`,
  pubkey: (addr: string, pollId: number) => `${PREFIX}-pubkey-${addr}-${pollId}`,
  sk: (addr: string) => `${PREFIX}-sk-${addr}`,
  skPoll: (addr: string, pollId: number) => `${PREFIX}-sk-${addr}-${pollId}`,
  nonce: (addr: string, pollId: number) => `${PREFIX}-nonce-${addr}-${pollId}`,
  lastVote: (addr: string, pollId: number) => `${PREFIX}-lastVote-${addr}-${pollId}`,
  creditsSpent: (addr: string, pollId: number) => `${PREFIX}-creditsSpent-${addr}-${pollId}`,
  stateIndex: (addr: string) => `${PREFIX}-stateIndex-${addr}`,
  stateIndexPoll: (addr: string, pollId: number) => `${PREFIX}-stateIndex-${addr}-${pollId}`,
  delegationChangedAt: (addr: string) => `${PREFIX}-delegation-change-${addr}`,
  pollTitle: (pollId: number) => `${PREFIX}-poll-title-${pollId}`,
  pollDesc: (pollId: number) => `${PREFIX}-poll-desc-${pollId}`,
  pollsCache: `${PREFIX}-polls-cache`,
}

/** Parse on-chain title field that may contain description after \n\n */
export function parseOnChainTitle(raw: string): { title: string; description?: string } {
  const idx = raw.indexOf('\n\n')
  if (idx === -1) return { title: raw }
  return { title: raw.slice(0, idx), description: raw.slice(idx + 2) }
}
