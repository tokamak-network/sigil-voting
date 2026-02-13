/**
 * Transaction Submitter
 *
 * Submits MACI transactions to the blockchain:
 *   1. AccQueue merge operations (post-voting)
 *   2. processMessages with Groth16 proof
 *   3. tallyVotes with Groth16 proof
 *   4. publishResults with final tally
 */

import { ethers } from 'ethers';
import type { ProofResult } from '../processing/batchProof.js';

export interface SubmitterConfig {
  signer: ethers.Signer;
  pollAddress: string;
  messageProcessorAddress: string;
  tallyAddress: string;
  pollAbi: ethers.InterfaceAbi;
  mpAbi: ethers.InterfaceAbi;
  tallyAbi: ethers.InterfaceAbi;
}

export class TransactionSubmitter {
  private poll: ethers.Contract;
  private mp: ethers.Contract;
  private tally: ethers.Contract;

  constructor(config: SubmitterConfig) {
    this.poll = new ethers.Contract(config.pollAddress, config.pollAbi, config.signer);
    this.mp = new ethers.Contract(config.messageProcessorAddress, config.mpAbi, config.signer);
    this.tally = new ethers.Contract(config.tallyAddress, config.tallyAbi, config.signer);
  }

  /**
   * Merge AccQueues (must be called after voting ends)
   */
  async mergeAccQueues(): Promise<void> {
    console.log('Merging State AccQueue sub-roots...');
    const tx1 = await this.poll.mergeMaciStateAqSubRoots(0);
    await tx1.wait();

    console.log('Merging State AccQueue...');
    const tx2 = await this.poll.mergeMaciStateAq();
    await tx2.wait();

    console.log('Merging Message AccQueue sub-roots...');
    const tx3 = await this.poll.mergeMessageAqSubRoots(0);
    await tx3.wait();

    console.log('Merging Message AccQueue...');
    const tx4 = await this.poll.mergeMessageAq();
    await tx4.wait();

    console.log('All AccQueues merged.');
  }

  /**
   * Submit processMessages proof
   */
  async submitProcessProof(
    newStateCommitment: bigint,
    proof: ProofResult,
  ): Promise<ethers.TransactionReceipt | null> {
    const { pi_a, pi_b, pi_c } = proof.proof;

    const pA: [bigint, bigint] = [BigInt(pi_a[0]), BigInt(pi_a[1])];
    const pB: [[bigint, bigint], [bigint, bigint]] = [
      [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])], // Note: reversed for Solidity
      [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])],
    ];
    const pC: [bigint, bigint] = [BigInt(pi_c[0]), BigInt(pi_c[1])];

    console.log('Submitting processMessages proof...');
    const tx = await this.mp.processMessages(newStateCommitment, pA, pB, pC);
    return tx.wait();
  }

  /**
   * Mark processing as complete
   */
  async completeProcessing(): Promise<ethers.TransactionReceipt | null> {
    console.log('Completing processing...');
    const tx = await this.mp.completeProcessing();
    return tx.wait();
  }

  /**
   * Submit tallyVotes proof
   */
  async submitTallyProof(
    newTallyCommitment: bigint,
    proof: ProofResult,
  ): Promise<ethers.TransactionReceipt | null> {
    const { pi_a, pi_b, pi_c } = proof.proof;

    const pA: [bigint, bigint] = [BigInt(pi_a[0]), BigInt(pi_a[1])];
    const pB: [[bigint, bigint], [bigint, bigint]] = [
      [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
      [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])],
    ];
    const pC: [bigint, bigint] = [BigInt(pi_c[0]), BigInt(pi_c[1])];

    console.log('Submitting tallyVotes proof...');
    const tx = await this.tally.tallyVotes(newTallyCommitment, pA, pB, pC);
    return tx.wait();
  }

  /**
   * Publish final results
   */
  async publishResults(
    forVotes: bigint,
    againstVotes: bigint,
    abstainVotes: bigint,
    totalVoters: bigint,
    tallyResultsHash: bigint,
  ): Promise<ethers.TransactionReceipt | null> {
    console.log('Publishing results...');
    const tx = await this.tally.publishResults(
      forVotes,
      againstVotes,
      abstainVotes,
      totalVoters,
      tallyResultsHash,
    );
    return tx.wait();
  }
}
