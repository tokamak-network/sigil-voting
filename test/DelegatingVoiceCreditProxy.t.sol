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

    // 2. Delegating user gets delegate's balance
    function test_delegatingGetsDelegateBalance() public {
        token.mint(alice, 100 ether);
        token.mint(bob, 999 ether);

        vm.prank(alice);
        registry.delegate(bob);

        uint256 credits = proxy.getVoiceCredits(alice, "");
        assertEq(credits, 999); // Alice gets Bob's balance
    }

    // 3. Zero balance returns 0
    function test_zeroBalanceReturnsZero() public view {
        uint256 credits = proxy.getVoiceCredits(alice, "");
        assertEq(credits, 0);
    }

    // 4. Constructor with zero token reverts
    function test_constructorZeroTokenReverts() public {
        vm.expectRevert(DelegatingVoiceCreditProxy.ZeroToken.selector);
        new DelegatingVoiceCreditProxy(address(0), address(registry));
    }
}
