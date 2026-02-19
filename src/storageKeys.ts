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
  pollTitle: (pollId: number) => `${PREFIX}-poll-title-${pollId}`,
  pollDesc: (pollId: number) => `${PREFIX}-poll-desc-${pollId}`,
  pollsCache: `${PREFIX}-polls-cache`,
}
