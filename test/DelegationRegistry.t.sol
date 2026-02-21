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
        assertEq(registry.getEffectiveVoter(alice), bob);
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

    // 4. getEffectiveVoter returns delegate when delegating
    function test_getEffectiveVoterDelegating() public {
        vm.prank(alice);
        registry.delegate(bob);
        assertEq(registry.getEffectiveVoter(alice), bob);
    }

    // 5. getEffectiveVoter returns self when not delegating
    function test_getEffectiveVoterNotDelegating() public view {
        assertEq(registry.getEffectiveVoter(alice), alice);
    }

    // 6. isDelegating returns true after delegate
    function test_isDelegatingTrue() public {
        vm.prank(alice);
        registry.delegate(bob);
        assertTrue(registry.isDelegating(alice));
    }

    // 7. isDelegating returns false initially
    function test_isDelegatingFalse() public view {
        assertFalse(registry.isDelegating(alice));
    }

    // 8. undelegate works
    function test_undelegate() public {
        vm.prank(alice);
        registry.delegate(bob);
        assertTrue(registry.isDelegating(alice));

        vm.prank(alice);
        registry.undelegate();
        assertFalse(registry.isDelegating(alice));
        assertEq(registry.getEffectiveVoter(alice), alice);
    }

    // 9. undelegate when not delegating reverts
    function test_undelegateNotDelegatingReverts() public {
        vm.prank(alice);
        vm.expectRevert(DelegationRegistry.NotDelegating.selector);
        registry.undelegate();
    }

    // 10. re-delegate to new address
    function test_reDelegate() public {
        vm.prank(alice);
        registry.delegate(bob);
        assertEq(registry.getEffectiveVoter(alice), bob);

        vm.prank(alice);
        registry.delegate(charlie);
        assertEq(registry.getEffectiveVoter(alice), charlie);
    }
}
