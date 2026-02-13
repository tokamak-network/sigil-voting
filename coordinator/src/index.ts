/**
 * MACI Coordinator Service
 *
 * Orchestrates the full MACI workflow:
 *   1. Listen for on-chain events (SignUp, MessagePublished)
 *   2. Wait for voting period to end
 *   3. Merge AccQueues on-chain
 *   4. Process messages in reverse order (off-chain)
 *   5. Generate processMessages ZK proof
 *   6. Submit proof on-chain
 *   7. Tally votes
 *   8. Generate tallyVotes ZK proof
 *   9. Submit proof + publish results on-chain
 */

export { QuinaryMerkleTree } from './trees/quinaryTree.js';
export type { QuinaryMerkleProof } from './trees/quinaryTree.js';
export { AccQueueOffchain } from './trees/accQueue.js';
export { processMessages } from './processing/processMessages.js';
export type { EncryptedMessage, Command, StateLeaf, Ballot, ProcessResult } from './processing/processMessages.js';
export { tallyVotes } from './processing/tally.js';
export type { TallyResult } from './processing/tally.js';
export { generateProcessProof, generateTallyProof, computePublicInputHash } from './processing/batchProof.js';
export type { ProofResult } from './processing/batchProof.js';
export { EventListener } from './chain/listener.js';
export type { ListenerConfig, OnchainState } from './chain/listener.js';
export { TransactionSubmitter } from './chain/submitter.js';
export type { SubmitterConfig } from './chain/submitter.js';
