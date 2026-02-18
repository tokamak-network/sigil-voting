/**
 * Quinary (5-ary) Merkle Tree
 *
 * Each node has 5 children, hashed with Poseidon(5).
 * Used for MACI state trees, ballot trees, and message trees.
 */

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

export interface QuinaryMerkleProof {
  pathElements: bigint[][];  // [depth][5] all children at each level
  pathIndices: number[];     // [depth] 0-4 position
  root: bigint;
}

export class QuinaryMerkleTree {
  readonly depth: number;
  readonly arity = 5;
  private leaves: bigint[];
  private nodes: Map<string, bigint> = new Map();
  private zeroValues: bigint[];
  private poseidon: any = null;

  constructor(depth: number) {
    this.depth = depth;
    const capacity = 5 ** depth;
    this.leaves = new Array(capacity).fill(0n);
    this.zeroValues = new Array(depth + 1).fill(0n);
  }

  async init(): Promise<void> {
    this.poseidon = await getPoseidon();
    // Precompute zero values for each level
    this.zeroValues[0] = 0n;
    for (let i = 1; i <= this.depth; i++) {
      const children = new Array(this.arity).fill(this.zeroValues[i - 1]);
      this.zeroValues[i] = poseidonHash(this.poseidon, children);
    }
  }

  get root(): bigint {
    return this.getNodeHash(this.depth, 0);
  }

  get numLeaves(): number {
    return this.leaves.filter((l) => l !== 0n).length;
  }

  insert(index: number, leaf: bigint): void {
    const capacity = 5 ** this.depth;
    if (index >= capacity) throw new Error(`Index ${index} exceeds capacity ${capacity}`);
    this.leaves[index] = leaf;
    this.invalidatePathNodes(index);
  }

  update(index: number, leaf: bigint): void {
    this.insert(index, leaf);
  }

  getLeaf(index: number): bigint {
    return this.leaves[index] ?? 0n;
  }

  getProof(index: number): QuinaryMerkleProof {
    const pathElements: bigint[][] = [];
    const pathIndices: number[] = [];

    let currentIndex = index;

    for (let level = 0; level < this.depth; level++) {
      const positionInParent = currentIndex % this.arity;
      const parentStartIndex = currentIndex - positionInParent;

      pathIndices.push(positionInParent);

      // Collect all 5 children (circuit replaces leaf position via isPos mux)
      const children: bigint[] = [];
      for (let j = 0; j < this.arity; j++) {
        children.push(this.getNodeHash(level, parentStartIndex + j));
      }
      pathElements.push(children);

      currentIndex = Math.floor(currentIndex / this.arity);
    }

    return { pathElements, pathIndices, root: this.root };
  }

  private getNodeHash(level: number, index: number): bigint {
    if (level === 0) {
      return this.leaves[index] ?? 0n;
    }

    const key = `${level}:${index}`;
    const cached = this.nodes.get(key);
    if (cached !== undefined) return cached;

    // Compute from children
    const children: bigint[] = [];
    const childStart = index * this.arity;
    for (let j = 0; j < this.arity; j++) {
      children.push(this.getNodeHash(level - 1, childStart + j));
    }

    // Check if all children are zero
    if (children.every((c) => c === this.zeroValues[level - 1])) {
      return this.zeroValues[level];
    }

    const hash = poseidonHash(this.poseidon, children);
    this.nodes.set(key, hash);
    return hash;
  }

  private invalidatePathNodes(leafIndex: number): void {
    let currentIndex = leafIndex;
    for (let level = 1; level <= this.depth; level++) {
      currentIndex = Math.floor(currentIndex / this.arity);
      this.nodes.delete(`${level}:${currentIndex}`);
    }
  }
}
