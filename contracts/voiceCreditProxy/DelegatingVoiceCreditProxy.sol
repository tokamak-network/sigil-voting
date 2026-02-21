// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVoiceCreditProxy} from "./IVoiceCreditProxy.sol";
import {DelegationRegistry} from "../governance/DelegationRegistry.sol";

/// @title DelegatingVoiceCreditProxy - Delegation-aware voice credit allocation
/// @notice Delegate gets own balance + all delegators' balances. Delegators get 0 (they don't vote).
/// @dev A delegates to B → B votes with A+B combined power, A cannot vote.
contract DelegatingVoiceCreditProxy is IVoiceCreditProxy {
    address public immutable token;
    uint8 public immutable tokenDecimals;
    DelegationRegistry public immutable delegationRegistry;

    error ZeroToken();
    error ZeroRegistry();

    constructor(address _token, address _delegationRegistry) {
        if (_token == address(0)) revert ZeroToken();
        if (_delegationRegistry == address(0)) revert ZeroRegistry();
        token = _token;
        delegationRegistry = DelegationRegistry(_delegationRegistry);

        // Cache decimals at deploy time
        (bool ok, bytes memory data) = _token.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && data.length >= 32, "decimals failed");
        tokenDecimals = abi.decode(data, (uint8));
    }

    /// @notice Returns voice credits: 0 if delegating, own + delegators' if delegate
    function getVoiceCredits(address _user, bytes memory) external view override returns (uint256) {
        // If user is delegating to someone else, they cannot vote (credits = 0)
        if (delegationRegistry.isDelegating(_user)) {
            return 0;
        }

        // Start with user's own balance
        uint256 total = _balanceOf(_user);

        // Add balances of everyone who delegated to this user
        address[] memory delegators = delegationRegistry.getDelegators(_user);
        for (uint256 i = 0; i < delegators.length; i++) {
            total += _balanceOf(delegators[i]);
        }

        return total / (10 ** tokenDecimals);
    }

    function _balanceOf(address _addr) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", _addr));
        require(ok && data.length >= 32, "balance check failed");
        return abi.decode(data, (uint256));
    }
}
