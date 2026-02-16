/**
 * @sigil/sdk — Private, Fair, Collusion-Resistant Governance
 *
 * Integrate SIGIL voting into any DAO in 3 lines:
 *
 *   import { SigilClient } from '@sigil/sdk';
 *   const sigil = new SigilClient({ maciAddress, provider, signer });
 *   await sigil.vote(pollId, 'for', 3); // 3 votes = 9 credits (quadratic)
 *
 * Features:
 *   - Private voting (ZK — votes never revealed)
 *   - Anti-collusion (MACI key change — bribery is useless)
 *   - Quadratic voting (fair — cost = votes²)
 *   - On-chain verified (Groth16 ZK-SNARK proofs)
 */

export { SigilClient, type SigilConfig } from './client.js';
export { type Poll, type PollStatus, type PollResults, type VoteChoice } from './types.js';
