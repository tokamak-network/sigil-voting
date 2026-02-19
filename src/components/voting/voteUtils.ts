/**
 * Vote utilities (localStorage-based)
 *
 * MACI nonce: ALL messages (votes + key changes) share a single
 * incrementing counter per user per poll. This is critical because
 * MACI processes messages in reverse order and only nonce=1 is valid.
 */

import { storageKey } from '../../storageKeys'

export function getLastVote(address: string, pollId: number): { choice: number; weight: number; cost: number } | null {
  const key = storageKey.lastVote(address, pollId);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (typeof parsed.choice === 'number' && typeof parsed.weight === 'number' && typeof parsed.cost === 'number') {
      return parsed;
    }
    return null;
  } catch { return null; }
}

/**
 * Shared MACI nonce — votes AND key changes use the same counter.
 * In MACI reverse processing, only the message with nonce matching
 * ballot.nonce+1 (initially 0+1=1) is valid. So the FIRST submitted
 * message is always the final one.
 */
export function getMaciNonce(address: string, pollId: number): number {
  const key = storageKey.nonce(address, pollId);
  return parseInt(localStorage.getItem(key) || '1', 10);
}

export function incrementMaciNonce(address: string, pollId: number): void {
  const key = storageKey.nonce(address, pollId);
  const current = getMaciNonce(address, pollId);
  localStorage.setItem(key, String(current + 1));
}
