// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";

/// @title AccQueue - Accumulator Queue for Quinary (5-ary) Merkle Trees
/// @notice On-chain tree management: enqueue leaves into subtrees, then merge subtrees into a main tree.
///         Based on MACI's AccQueue pattern optimized for Poseidon(5) hashing.
/// @dev The tree is built incrementally:
///      1. enqueue() - adds leaves into fixed-depth subtrees (arity=5)
///      2. mergeSubRoots() - merges subtree roots into a mid-level tree
///      3. merge() - produces the final main root
contract AccQueue {
    // ============ Errors ============
    error LeafTooLarge();
    error AlreadyMerged();
    error SubRootsAlreadyMerged();
    error SubRootsNotMerged();
    error NoSubtrees();
    error IndexOutOfBounds();
    error NotMerged();
    error NotOwner();

    // ============ Constants ============

    uint256 internal constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @notice Owner (the contract authorized to enqueue — MACI or Poll)
    address public owner;

    /// @notice Only the owner can enqueue leaves
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    error ZeroAddress();

    /// @notice Transfer ownership (e.g., deployer → MACI contract)
    function transferOwnership(address _newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (_newOwner == address(0)) revert ZeroAddress();
        owner = _newOwner;
    }

    /// @notice Tree arity (5 for quinary)
    uint256 public immutable ARITY;

    /// @notice Subtree depth (each subtree has ARITY^depth leaves)
    uint256 public immutable SUB_DEPTH;

    /// @notice Hash domain separator depth
    uint256 public immutable HASH_LENGTH;

    // ============ State ============

    /// @notice All enqueued leaf values
    uint256[] public leaves;

    /// @notice Subtree roots (each subtree has ARITY^SUB_DEPTH leaves)
    uint256[] public subRoots;

    /// @notice Current subtree leaf count (resets when subtree is full)
    uint256 public currentSubtreeLeafCount;

    /// @notice Running levels for the current subtree being built
    mapping(uint256 => mapping(uint256 => uint256)) internal currentSubtree;
    mapping(uint256 => uint256) internal currentSubtreeLevelCount;

    /// @notice The main root after merge()
    uint256 public mainRoot;

    /// @notice Whether subRoots have been merged into the main tree
    bool public subRootsMerged;

    /// @notice Whether the main root has been computed
    bool public merged;

    /// @notice Total number of leaves enqueued
    uint256 public numLeaves;

    /// @notice Number of subRoots processed so far during incremental merge
    uint256 public mergeProgress;

    /// @notice Number of leaves per subtree
    uint256 public immutable LEAVES_PER_SUBTREE;

    /// @notice Zero values for each level (precomputed)
    mapping(uint256 => uint256) public zeros;

    // ============ Events ============

    event Enqueued(uint256 indexed index, uint256 leaf);
    event SubTreeMerged(uint256 indexed subTreeIndex, uint256 subTreeRoot);
    event Merged(uint256 mainRoot);

    // ============ Constructor ============

    /// @param _arity Tree arity (must be 5 for quinary)
    /// @param _subDepth Depth of each subtree
    constructor(uint256 _arity, uint256 _subDepth) {
        require(_arity == 5, "Only quinary (arity=5) supported");
        require(_subDepth > 0 && _subDepth <= 4, "SubDepth must be 1-4");
        owner = msg.sender;

        ARITY = _arity;
        SUB_DEPTH = _subDepth;
        HASH_LENGTH = _arity;

        // Compute leaves per subtree: 5^subDepth
        uint256 lps = 1;
        for (uint256 i = 0; i < _subDepth;) {
            lps *= _arity;
            unchecked {
                ++i;
            }
        }
        LEAVES_PER_SUBTREE = lps;

        // Precompute zero values for each level
        // zeros[0] = 0 (empty leaf)
        zeros[0] = 0;
        uint256 limit = _subDepth + 10;
        for (uint256 i = 1; i <= limit;) {
            uint256 z = zeros[i - 1];
            zeros[i] = PoseidonT6.hash([z, z, z, z, z]);
            unchecked {
                ++i;
            }
        }
    }

    // ============ Enqueue ============

    /// @notice Add a leaf to the accumulator queue
    /// @param _leaf The leaf value to enqueue
    /// @return leafIndex The global index of the enqueued leaf
    function enqueue(uint256 _leaf) external onlyOwner returns (uint256 leafIndex) {
        if (_leaf >= SNARK_SCALAR_FIELD) revert LeafTooLarge();
        if (merged) revert AlreadyMerged();

        leafIndex = numLeaves;
        leaves.push(_leaf);

        // Add to current subtree
        uint256 posInSubtree = currentSubtreeLeafCount;
        _insertIntoSubtree(_leaf, posInSubtree);
        currentSubtreeLeafCount++;

        // If subtree is full, compute its root and reset
        if (currentSubtreeLeafCount == LEAVES_PER_SUBTREE) {
            uint256 subRoot = _computeSubtreeRoot();
            subRoots.push(subRoot);
            emit SubTreeMerged(subRoots.length - 1, subRoot);
            _resetCurrentSubtree();
        }

        numLeaves++;
        emit Enqueued(leafIndex, _leaf);
    }

    /// @notice Insert a leaf into the running subtree computation
    function _insertIntoSubtree(uint256 _leaf, uint256 _index) internal {
        // Level 0: store the leaf
        currentSubtree[0][_index] = _leaf;
        currentSubtreeLevelCount[0] = _index + 1;
    }

    /// @notice Compute the current subtree root from stored leaves
    function _computeSubtreeRoot() internal view returns (uint256) {
        uint256 levelSize = LEAVES_PER_SUBTREE;

        // Copy level 0 leaves
        uint256[] memory currentLevel = new uint256[](levelSize);
        for (uint256 i = 0; i < levelSize;) {
            currentLevel[i] = currentSubtree[0][i];
            unchecked {
                ++i;
            }
        }

        // Hash up the tree
        uint256 subDepth = SUB_DEPTH;
        for (uint256 level = 0; level < subDepth;) {
            uint256 nextLevelSize = levelSize / ARITY;
            uint256[] memory nextLevel = new uint256[](nextLevelSize);

            for (uint256 i = 0; i < nextLevelSize;) {
                uint256 baseIdx = i * ARITY;
                nextLevel[i] = PoseidonT6.hash(
                    [
                        currentLevel[baseIdx],
                        currentLevel[baseIdx + 1],
                        currentLevel[baseIdx + 2],
                        currentLevel[baseIdx + 3],
                        currentLevel[baseIdx + 4]
                    ]
                );
                unchecked {
                    ++i;
                }
            }

            currentLevel = nextLevel;
            levelSize = nextLevelSize;
            unchecked {
                ++level;
            }
        }

        return currentLevel[0];
    }

    /// @notice Reset current subtree state for the next subtree
    function _resetCurrentSubtree() internal {
        uint256 lps = LEAVES_PER_SUBTREE;
        for (uint256 i = 0; i < lps;) {
            delete currentSubtree[0][i];
            unchecked {
                ++i;
            }
        }
        currentSubtreeLeafCount = 0;
        delete currentSubtreeLevelCount[0];
    }

    // ============ Merge ============

    /// @notice Merge sub-tree roots into the main tree
    /// @param _numSrQueueOps Number of operations (0 = all at once)
    function mergeSubRoots(uint256 _numSrQueueOps) external {
        if (merged) revert AlreadyMerged();
        if (subRootsMerged) revert SubRootsAlreadyMerged();

        // If there are remaining leaves in an incomplete subtree, finalize it
        if (currentSubtreeLeafCount > 0) {
            _padAndFinalizeCurrentSubtree();
        }

        uint256 total = subRoots.length;
        if (total == 0) revert NoSubtrees();

        if (_numSrQueueOps == 0) {
            // Process all remaining at once
            mergeProgress = total;
        } else {
            // Process incrementally
            uint256 remaining = total - mergeProgress;
            uint256 toProcess = _numSrQueueOps < remaining ? _numSrQueueOps : remaining;
            mergeProgress += toProcess;
        }

        // Mark as merged only when all subRoots have been processed
        if (mergeProgress >= total) {
            subRootsMerged = true;
        }
    }

    /// @notice Pad remaining slots with zeros and finalize the current subtree
    function _padAndFinalizeCurrentSubtree() internal {
        // Pad remaining positions with zero
        uint256 remaining = LEAVES_PER_SUBTREE - currentSubtreeLeafCount;
        for (uint256 i = 0; i < remaining;) {
            currentSubtree[0][currentSubtreeLeafCount + i] = zeros[0];
            unchecked {
                ++i;
            }
        }
        currentSubtreeLeafCount = LEAVES_PER_SUBTREE;

        uint256 subRoot = _computeSubtreeRoot();
        subRoots.push(subRoot);
        emit SubTreeMerged(subRoots.length - 1, subRoot);
        _resetCurrentSubtree();
    }

    /// @notice Compute the final main root from all subtree roots
    function merge() external {
        if (!subRootsMerged) revert SubRootsNotMerged();
        if (merged) revert AlreadyMerged();

        uint256 numSubRoots = subRoots.length;
        if (numSubRoots == 0) revert NoSubtrees();

        // Build a tree from subtree roots using quinary hashing
        mainRoot = _buildTreeFromRoots();
        merged = true;
        emit Merged(mainRoot);
    }

    /// @notice Build a quinary tree from subtree roots
    function _buildTreeFromRoots() internal view returns (uint256) {
        uint256 len = subRoots.length;
        uint256[] memory currentLevel = new uint256[](len);
        for (uint256 i = 0; i < len;) {
            currentLevel[i] = subRoots[i];
            unchecked {
                ++i;
            }
        }

        // Pad to multiple of ARITY
        uint256 levelSize = len;
        uint256 arity = ARITY;
        uint256 zeroVal = zeros[SUB_DEPTH];
        while (levelSize > 1) {
            // Pad with zero roots if not multiple of ARITY
            uint256 remainder = levelSize % arity;
            uint256 paddedSize = levelSize;
            if (remainder != 0) {
                paddedSize = levelSize + (arity - remainder);
            }

            uint256[] memory padded = new uint256[](paddedSize);
            for (uint256 i = 0; i < levelSize;) {
                padded[i] = currentLevel[i];
                unchecked {
                    ++i;
                }
            }
            for (uint256 i = levelSize; i < paddedSize;) {
                padded[i] = zeroVal;
                unchecked {
                    ++i;
                }
            }

            uint256 nextSize = paddedSize / arity;
            uint256[] memory nextLevel = new uint256[](nextSize);
            for (uint256 i = 0; i < nextSize;) {
                uint256 baseIdx = i * arity;
                nextLevel[i] = PoseidonT6.hash(
                    [
                        padded[baseIdx],
                        padded[baseIdx + 1],
                        padded[baseIdx + 2],
                        padded[baseIdx + 3],
                        padded[baseIdx + 4]
                    ]
                );
                unchecked {
                    ++i;
                }
            }

            currentLevel = nextLevel;
            levelSize = nextSize;
        }

        return currentLevel[0];
    }

    // ============ View Functions ============

    /// @notice Get the main root (only valid after merge)
    function getMainRoot() external view returns (uint256) {
        if (!merged) revert NotMerged();
        return mainRoot;
    }

    /// @notice Get number of subtrees
    function getNumSubRoots() external view returns (uint256) {
        return subRoots.length;
    }

    /// @notice Get a subtree root by index
    function getSubRoot(uint256 _index) external view returns (uint256) {
        if (_index >= subRoots.length) revert IndexOutOfBounds();
        return subRoots[_index];
    }

    /// @notice Get total number of leaves
    function getNumLeaves() external view returns (uint256) {
        return numLeaves;
    }

    /// @notice Check if the queue has been merged
    function isMerged() external view returns (bool) {
        return merged;
    }

    /// @notice Reset merge state so new enqueues can be accepted.
    ///         Called by MACI after poll processing to allow future signups.
    ///         Leaves and subtrees are preserved — only merge flags are reset.
    function resetMerge() external onlyOwner {
        merged = false;
        subRootsMerged = false;
        mergeProgress = 0;
    }
}
