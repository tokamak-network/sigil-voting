/**
 * Vote Tallying
 *
 * After message processing, aggregate vote weights from ballots.
 * Compute tally commitment: poseidon_3(tallyResultsRoot, totalSpent, perOptionSpentRoot)
 *
 * D1: tally += votingPower (1:1 linear)
 * D2: tally += numVotes (quadratic cost already verified in MessageProcessor)
 */

import type { QuinaryMerkleTree } from '../trees/quinaryTree.js';

export interface TallyResult {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;    // D1 only, 0 for D2
  totalVoters: number;
  totalSpentVoiceCredits: bigint;
  perOptionTally: bigint[];
  perOptionSpent: bigint[];
  tallyCommitment: bigint;
}

export interface TallyInput {
  stateTree: QuinaryMerkleTree;
  ballotTree: QuinaryMerkleTree;
  numSignUps: number;
  numVoteOptions: number;
  isD2: boolean;            // true = quadratic (D2), false = linear (D1)
  getStateLeaf: (index: number) => { voiceCreditBalance: bigint };
  getBallot: (index: number) => { votes: bigint[] };
  poseidonHash3: (a: bigint, b: bigint, c: bigint) => bigint;
  computeTallyResultsRoot: (tally: bigint[]) => bigint;
  computePerOptionSpentRoot: (spent: bigint[]) => bigint;
}

export async function tallyVotes(input: TallyInput): Promise<TallyResult> {
  const {
    numSignUps,
    numVoteOptions,
    isD2,
    getStateLeaf,
    getBallot,
    poseidonHash3,
    computeTallyResultsRoot,
    computePerOptionSpentRoot,
  } = input;

  const perOptionTally = new Array(numVoteOptions).fill(0n);
  const perOptionSpent = new Array(numVoteOptions).fill(0n);
  let totalSpentVoiceCredits = 0n;
  let totalVoters = 0;

  // Iterate over all registered voters (skip index 0 = blank leaf)
  for (let i = 1; i < numSignUps; i++) {
    const ballot = getBallot(i);
    const stateLeaf = getStateLeaf(i);
    let hasVoted = false;

    for (let j = 0; j < numVoteOptions; j++) {
      const weight = ballot.votes[j] ?? 0n;
      if (weight > 0n) {
        hasVoted = true;
        perOptionTally[j] += weight;

        // Spent credits: weight^2
        const spent = weight * weight;
        perOptionSpent[j] += spent;
        totalSpentVoiceCredits += spent;
      }
    }

    if (hasVoted) totalVoters++;
  }

  // Map vote options to for/against/abstain
  // Convention: option 0 = against, option 1 = for, option 2 = abstain (D1 only)
  const againstVotes = perOptionTally[0] ?? 0n;
  const forVotes = perOptionTally[1] ?? 0n;
  const abstainVotes = isD2 ? 0n : (perOptionTally[2] ?? 0n);

  // Compute tally commitment: poseidon_3(tallyResultsRoot, totalSpent, perOptionSpentRoot)
  const tallyResultsRoot = computeTallyResultsRoot(perOptionTally);
  const perOptionSpentRoot = computePerOptionSpentRoot(perOptionSpent);
  const tallyCommitment = poseidonHash3(tallyResultsRoot, totalSpentVoiceCredits, perOptionSpentRoot);

  return {
    forVotes,
    againstVotes,
    abstainVotes,
    totalVoters,
    totalSpentVoiceCredits,
    perOptionTally,
    perOptionSpent,
    tallyCommitment,
  };
}
