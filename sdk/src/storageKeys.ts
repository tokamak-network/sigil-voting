/**
 * Storage key generator scoped to MACI contract address.
 * Parameterized (no hardcoded address) — caller passes maciAddress.
 */

export function createStorageKeys(maciAddress: string) {
  const prefix = `maci-${maciAddress.slice(2, 8)}`;

  return {
    signup: (addr: string) => `${prefix}-signup-${addr}`,
    pk: (addr: string) => `${prefix}-pk-${addr}`,
    pubkey: (addr: string, pollId: number) => `${prefix}-pubkey-${addr}-${pollId}`,
    sk: (addr: string) => `${prefix}-sk-${addr}`,
    skPoll: (addr: string, pollId: number) => `${prefix}-sk-${addr}-${pollId}`,
    nonce: (addr: string, pollId: number) => `${prefix}-nonce-${addr}-${pollId}`,
    lastVote: (addr: string, pollId: number) => `${prefix}-lastVote-${addr}-${pollId}`,
    creditsSpent: (addr: string, pollId: number) => `${prefix}-creditsSpent-${addr}-${pollId}`,
    stateIndex: (addr: string) => `${prefix}-stateIndex-${addr}`,
    stateIndexPoll: (addr: string, pollId: number) => `${prefix}-stateIndex-${addr}-${pollId}`,
  };
}

export type StorageKeys = ReturnType<typeof createStorageKeys>;
