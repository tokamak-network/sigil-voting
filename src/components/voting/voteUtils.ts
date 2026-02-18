/**
 * Vote history utilities (localStorage-based)
 */

export function getLastVote(address: string, pollId: number): { choice: number; weight: number; cost: number } | null {
  const key = `maci-lastVote-${address}-${pollId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}
