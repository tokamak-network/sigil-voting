// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/voiceCreditProxy/DelegatingVoiceCreditProxy.sol";
import "../contracts/governance/DelegationRegistry.sol";

/// @dev Simple ERC20 mock for testing
contract MockERC20ForProxy {
    mapping(address => uint256) public balanceOf;
    uint8 public decimals = 18;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

contract DelegatingVoiceCreditProxyTest is Test {
    DelegatingVoiceCreditProxy public proxy;
    DelegationRegistry public registry;
    MockERC20ForProxy public token;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");

    function setUp() public {
        token = new MockERC20ForProxy();
        registry = new DelegationRegistry();
        proxy = new DelegatingVoiceCreditProxy(address(token), address(registry));
    }

    // 1. Non-delegating user gets own balance
    function test_nonDelegatingGetsOwnBalance() public {
        token.mint(alice, 500 ether);
        uint256 credits = proxy.getVoiceCredits(alice, "");
        assertEq(credits, 500);
    }

    // 2. Delegator gets 0 credits (cannot vote)
    function test_delegatorGetsZeroCredits() public {
        token.mint(alice, 100 ether);
        token.mint(bob, 999 ether);

        vm.prank(alice);
        registry.delegate(bob);

        uint256 credits = proxy.getVoiceCredits(alice, "");
        assertEq(credits, 0); // Alice delegated, cannot vote
    }

    // 3. Delegate gets own + delegators' combined balance
    function test_delegateGetsCombinedBalance() public {
        token.mint(alice, 100 ether);
        token.mint(bob, 200 ether);

        vm.prank(alice);
        registry.delegate(bob);

        uint256 credits = proxy.getVoiceCredits(bob, "");
        assertEq(credits, 300); // Bob(200) + Alice(100)
    }

    // 4. Multiple delegators aggregate correctly
    function test_multipleDelegatorsAggregate() public {
        token.mint(alice, 100 ether);
        token.mint(bob, 200 ether);
        token.mint(charlie, 300 ether);

        vm.prank(alice);
        registry.delegate(charlie);
        vm.prank(bob);
        registry.delegate(charlie);

        uint256 credits = proxy.getVoiceCredits(charlie, "");
        assertEq(credits, 600); // Charlie(300) + Alice(100) + Bob(200)
    }

    // 5. After undelegation, delegator gets own balance back
    function test_afterUndelegationGetsOwnBalance() public {
        token.mint(alice, 100 ether);
        token.mint(bob, 200 ether);

        vm.prank(alice);
        registry.delegate(bob);

        // Bob has combined
        assertEq(proxy.getVoiceCredits(bob, ""), 300);
        // Alice has 0
        assertEq(proxy.getVoiceCredits(alice, ""), 0);

        // Alice undelegates
        vm.prank(alice);
        registry.undelegate();

        // Both get own balance
        assertEq(proxy.getVoiceCredits(alice, ""), 100);
        assertEq(proxy.getVoiceCredits(bob, ""), 200);
    }

    // 6. Zero balance returns 0
    function test_zeroBalanceReturnsZero() public view {
        uint256 credits = proxy.getVoiceCredits(alice, "");
        assertEq(credits, 0);
    }

    // 7. Constructor with zero token reverts
    function test_constructorZeroTokenReverts() public {
        vm.expectRevert(DelegatingVoiceCreditProxy.ZeroToken.selector);
        new DelegatingVoiceCreditProxy(address(0), address(registry));
    }
}
