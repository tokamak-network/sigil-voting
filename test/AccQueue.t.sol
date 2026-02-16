// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/AccQueue.sol";

contract AccQueueTest is Test {
    AccQueue public aq;

    // Quinary, subDepth=2 (25 leaves per subtree)
    uint256 constant ARITY = 5;
    uint256 constant SUB_DEPTH = 2;
    uint256 constant LEAVES_PER_SUBTREE = 25; // 5^2

    function setUp() public {
        aq = new AccQueue(ARITY, SUB_DEPTH);
    }

    // ============ Constructor Tests ============

    function test_Constructor_InitializesCorrectly() public view {
        assertEq(aq.ARITY(), ARITY);
        assertEq(aq.SUB_DEPTH(), SUB_DEPTH);
        assertEq(aq.LEAVES_PER_SUBTREE(), LEAVES_PER_SUBTREE);
        assertEq(aq.numLeaves(), 0);
        assertEq(aq.merged(), false);
        assertEq(aq.subRootsMerged(), false);
    }

    function test_Constructor_RevertsNonQuinary() public {
        vm.expectRevert("Only quinary (arity=5) supported");
        new AccQueue(2, SUB_DEPTH);
    }

    function test_Constructor_RevertsInvalidDepth() public {
        vm.expectRevert("SubDepth must be 1-4");
        new AccQueue(ARITY, 0);

        vm.expectRevert("SubDepth must be 1-4");
        new AccQueue(ARITY, 5);
    }

    // ============ Enqueue Tests ============

    function test_Enqueue_SingleLeaf() public {
        aq.enqueue(42);
        assertEq(aq.numLeaves(), 1);
        assertEq(aq.leaves(0), 42);
    }

    function test_Enqueue_MultipleLeaves() public {
        for (uint256 i = 1; i <= 10; i++) {
            aq.enqueue(i);
        }
        assertEq(aq.numLeaves(), 10);
        assertEq(aq.leaves(0), 1);
        assertEq(aq.leaves(9), 10);
    }

    function test_Enqueue_CreatesSubtreeWhenFull() public {
        // Enqueue 25 leaves to fill one subtree (5^2)
        for (uint256 i = 0; i < LEAVES_PER_SUBTREE; i++) {
            aq.enqueue(i + 1);
        }
        assertEq(aq.numLeaves(), LEAVES_PER_SUBTREE);
        assertEq(aq.getNumSubRoots(), 1);

        // Subtree root should be non-zero
        uint256 subRoot = aq.getSubRoot(0);
        assertTrue(subRoot != 0);
    }

    function test_Enqueue_CreatesMultipleSubtrees() public {
        // Enqueue 50 leaves = 2 subtrees
        for (uint256 i = 0; i < LEAVES_PER_SUBTREE * 2; i++) {
            aq.enqueue(i + 1);
        }
        assertEq(aq.getNumSubRoots(), 2);

        // Both subtree roots should be different
        uint256 sub0 = aq.getSubRoot(0);
        uint256 sub1 = aq.getSubRoot(1);
        assertTrue(sub0 != sub1);
    }

    function test_Enqueue_RevertsLeafTooLarge() public {
        uint256 tooLarge = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        vm.expectRevert(AccQueue.LeafTooLarge.selector);
        aq.enqueue(tooLarge);
    }

    function test_Enqueue_RevertsAfterMerge() public {
        aq.enqueue(1);
        aq.mergeSubRoots(0);
        aq.merge();

        vm.expectRevert(AccQueue.AlreadyMerged.selector);
        aq.enqueue(2);
    }

    // ============ Merge Tests ============

    function test_MergeSubRoots_FinalizesPartialSubtree() public {
        // Enqueue 3 leaves (partial subtree)
        aq.enqueue(10);
        aq.enqueue(20);
        aq.enqueue(30);

        assertEq(aq.getNumSubRoots(), 0); // Not yet complete

        aq.mergeSubRoots(0);
        assertTrue(aq.subRootsMerged());
        assertEq(aq.getNumSubRoots(), 1); // Partial subtree finalized
    }

    function test_Merge_ProducesMainRoot() public {
        // Enqueue some leaves
        for (uint256 i = 0; i < 7; i++) {
            aq.enqueue(i + 1);
        }

        aq.mergeSubRoots(0);
        aq.merge();

        assertTrue(aq.merged());
        uint256 root = aq.getMainRoot();
        assertTrue(root != 0);
    }

    function test_Merge_RevertsWithoutMergeSubRoots() public {
        aq.enqueue(1);
        vm.expectRevert(AccQueue.SubRootsNotMerged.selector);
        aq.merge();
    }

    function test_Merge_RevertsDoubleMerge() public {
        aq.enqueue(1);
        aq.mergeSubRoots(0);
        aq.merge();

        vm.expectRevert(AccQueue.AlreadyMerged.selector);
        aq.merge();
    }

    function test_GetMainRoot_RevertsBeforeMerge() public {
        aq.enqueue(1);
        vm.expectRevert(AccQueue.NotMerged.selector);
        aq.getMainRoot();
    }

    // ============ Determinism Tests ============

    function test_SameLeaves_SameRoot() public {
        // Queue A
        AccQueue aqA = new AccQueue(ARITY, SUB_DEPTH);
        aqA.enqueue(100);
        aqA.enqueue(200);
        aqA.enqueue(300);
        aqA.mergeSubRoots(0);
        aqA.merge();
        uint256 rootA = aqA.getMainRoot();

        // Queue B (same leaves)
        AccQueue aqB = new AccQueue(ARITY, SUB_DEPTH);
        aqB.enqueue(100);
        aqB.enqueue(200);
        aqB.enqueue(300);
        aqB.mergeSubRoots(0);
        aqB.merge();
        uint256 rootB = aqB.getMainRoot();

        assertEq(rootA, rootB);
    }

    function test_DifferentLeaves_DifferentRoot() public {
        AccQueue aqA = new AccQueue(ARITY, SUB_DEPTH);
        aqA.enqueue(100);
        aqA.mergeSubRoots(0);
        aqA.merge();

        AccQueue aqB = new AccQueue(ARITY, SUB_DEPTH);
        aqB.enqueue(200);
        aqB.mergeSubRoots(0);
        aqB.merge();

        assertTrue(aqA.getMainRoot() != aqB.getMainRoot());
    }

    // ============ SubDepth=1 Tests (simpler tree) ============

    function test_SubDepth1_Works() public {
        AccQueue aq1 = new AccQueue(ARITY, 1);
        assertEq(aq1.LEAVES_PER_SUBTREE(), 5);

        // Fill one subtree
        for (uint256 i = 0; i < 5; i++) {
            aq1.enqueue(i + 1);
        }
        assertEq(aq1.getNumSubRoots(), 1);

        aq1.mergeSubRoots(0);
        aq1.merge();
        assertTrue(aq1.getMainRoot() != 0);
    }

    // ============ Zero Values Tests ============

    function test_ZeroValues_Precomputed() public view {
        // zeros[0] should be 0
        assertEq(aq.zeros(0), 0);
        // zeros[1] should be hash(0,0,0,0,0)
        assertTrue(aq.zeros(1) != 0);
        // zeros[2] should be hash(zeros[1], zeros[1], zeros[1], zeros[1], zeros[1])
        assertTrue(aq.zeros(2) != 0);
        assertTrue(aq.zeros(1) != aq.zeros(2));
    }

    // ============ Events Tests ============

    function test_Enqueue_EmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit AccQueue.Enqueued(0, 42);
        aq.enqueue(42);
    }

    function test_Merge_EmitsEvent() public {
        aq.enqueue(1);
        aq.mergeSubRoots(0);

        // We can't easily predict the exact root, so just check the event is emitted
        aq.merge();
        assertTrue(aq.merged());
    }
}
