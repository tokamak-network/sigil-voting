/**
 * AccQueue Off-chain Reconstruction
 *
 * Mirrors the on-chain AccQueue logic for off-chain tree building.
 * Enqueue leaves during voting, merge into final quinary tree after voting ends.
 */

import { QuinaryMerkleTree } from './quinaryTree.js';

let poseidonInstance: any = null;

async function getPoseidon(): Promise<any> {
  if (!poseidonInstance) {
    const { buildPoseidon } = await import('circomlibjs');
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

function poseidonHash(poseidon: any, inputs: bigint[]): bigint {
  const hash = poseidon(inputs.map((x) => poseidon.F.e(x)));
  return BigInt(poseidon.F.toString(hash));
}

export class AccQueueOffchain {
  readonly arity = 5;
  readonly subDepth: number;
  readonly mainDepth: number;
  private leaves: bigint[] = [];
  private subRoots: bigint[] = [];
  private poseidon: any = null;
  private mainRoot: bigint = 0n;
  private merged = false;

  constructor(subDepth: number, mainDepth: number) {
    this.subDepth = subDepth;
    this.mainDepth = mainDepth;
  }

  async init(): Promise<void> {
    this.poseidon = await getPoseidon();
  }

  get numLeaves(): number {
    return this.leaves.length;
  }

  get root(): bigint {
    if (!this.merged) throw new Error('Not merged yet');
    return this.mainRoot;
  }

  enqueue(leaf: bigint): void {
    this.leaves.push(leaf);

    const leavesPerSubtree = this.arity ** this.subDepth;
    if (this.leaves.length % leavesPerSubtree === 0) {
      // Compute subtree root
      const start = this.leaves.length - leavesPerSubtree;
      const subtreeLeaves = this.leaves.slice(start, start + leavesPerSubtree);
      const subRoot = this.computeSubtreeRoot(subtreeLeaves);
      this.subRoots.push(subRoot);
    }
  }

  merge(): void {
    // Finalize any partial subtree
    const leavesPerSubtree = this.arity ** this.subDepth;
    const remaining = this.leaves.length % leavesPerSubtree;
    if (remaining > 0) {
      const start = this.leaves.length - remaining;
      const subtreeLeaves = this.leaves.slice(start);
      // Pad with zeros
      while (subtreeLeaves.length < leavesPerSubtree) {
        subtreeLeaves.push(0n);
      }
      const subRoot = this.computeSubtreeRoot(subtreeLeaves);
      this.subRoots.push(subRoot);
    }

    // Build main tree from subRoots
    this.mainRoot = this.buildTreeFromRoots(this.subRoots);
    this.merged = true;
  }

  private computeSubtreeRoot(leaves: bigint[]): bigint {
    let currentLevel = leaves;

    for (let d = 0; d < this.subDepth; d++) {
      const nextLevel: bigint[] = [];
      for (let i = 0; i < currentLevel.length; i += this.arity) {
        const children = currentLevel.slice(i, i + this.arity);
        while (children.length < this.arity) children.push(0n);
        nextLevel.push(poseidonHash(this.poseidon, children));
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  private buildTreeFromRoots(roots: bigint[]): bigint {
    const remainingDepth = this.mainDepth - this.subDepth;
    let currentLevel = [...roots];

    for (let d = 0; d < remainingDepth; d++) {
      const nextLevel: bigint[] = [];
      // Pad to multiple of arity
      while (currentLevel.length % this.arity !== 0) {
        currentLevel.push(0n);
      }
      for (let i = 0; i < currentLevel.length; i += this.arity) {
        const children = currentLevel.slice(i, i + this.arity);
        nextLevel.push(poseidonHash(this.poseidon, children));
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0] ?? 0n;
  }
}
