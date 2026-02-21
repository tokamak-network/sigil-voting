// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/governance/DelegationRegistry.sol";

contract DelegationRegistryTest is Test {
    DelegationRegistry public registry;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");

    function setUp() public {
        registry = new DelegationRegistry();
    }

    // 1. delegate to valid address
    function test_delegate() public {
        vm.prank(alice);
        registry.delegate(bob);
        assertEq(registry.getDelegate(alice), bob);
        assertTrue(registry.isDelegating(alice));
    }

    // 2. self-delegation reverts
    function test_selfDelegationReverts() public {
        vm.prank(alice);
        vm.expectRevert(DelegationRegistry.SelfDelegation.selector);
        registry.delegate(alice);
    }

    // 3. circular delegation reverts
    function test_circularDelegationReverts() public {
        vm.prank(alice);
        registry.delegate(bob);

        vm.prank(bob);
        vm.expectRevert(DelegationRegistry.CircularDelegation.selector);
        registry.delegate(alice);
    }

    // 4. getDelegators tracks delegators correctly
    function test_getDelegators() public {
        vm.prank(alice);
        registry.delegate(charlie);
        vm.prank(bob);
        registry.delegate(charlie);

        address[] memory delegators = registry.getDelegators(charlie);
        assertEq(delegators.length, 2);
        assertEq(delegators[0], alice);
        assertEq(delegators[1], bob);
    }

    // 5. isDelegating returns false initially
    function test_isDelegatingFalse() public view {
        assertFalse(registry.isDelegating(alice));
    }

    // 6. undelegate works and removes from delegators list
    function test_undelegate() public {
        vm.prank(alice);
        registry.delegate(bob);
        assertTrue(registry.isDelegating(alice));
        assertEq(registry.getDelegators(bob).length, 1);

        vm.prank(alice);
        registry.undelegate();
        assertFalse(registry.isDelegating(alice));
        assertEq(registry.getDelegate(alice), address(0));
        assertEq(registry.getDelegators(bob).length, 0);
    }

    // 7. undelegate when not delegating reverts
    function test_undelegateNotDelegatingReverts() public {
        vm.prank(alice);
        vm.expectRevert(DelegationRegistry.NotDelegating.selector);
        registry.undelegate();
    }

    // 8. re-delegate to new address updates delegators lists
    function test_reDelegate() public {
        vm.prank(alice);
        registry.delegate(bob);
        assertEq(registry.getDelegators(bob).length, 1);

        vm.prank(alice);
        registry.delegate(charlie);
        assertEq(registry.getDelegate(alice), charlie);
        assertEq(registry.getDelegators(bob).length, 0); // removed from bob
        assertEq(registry.getDelegators(charlie).length, 1); // added to charlie
    }

    // 9. duplicate delegation reverts
    function test_duplicateDelegationReverts() public {
        vm.prank(alice);
        registry.delegate(bob);

        vm.prank(alice);
        vm.expectRevert(DelegationRegistry.AlreadyDelegatingToSame.selector);
        registry.delegate(bob);
    }

    // 10. multiple delegators, one undelegates
    function test_multipleDelegatorsOneUndelegates() public {
        vm.prank(alice);
        registry.delegate(charlie);
        vm.prank(bob);
        registry.delegate(charlie);
        assertEq(registry.getDelegators(charlie).length, 2);

        vm.prank(alice);
        registry.undelegate();
        address[] memory remaining = registry.getDelegators(charlie);
        assertEq(remaining.length, 1);
        assertEq(remaining[0], bob);
    }
}
