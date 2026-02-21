// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVoiceCreditProxy} from "./IVoiceCreditProxy.sol";
import {DelegationRegistry} from "../governance/DelegationRegistry.sol";

/// @title DelegatingVoiceCreditProxy - Delegation-aware voice credit allocation
/// @notice Returns token balance of the effective voter (after delegation lookup)
/// @dev If user A delegates to user B, getVoiceCredits(A) returns B's token balance
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

    /// @notice Returns the effective voter's token balance as voice credits
    function getVoiceCredits(address _user, bytes memory) external view override returns (uint256) {
        // Look up effective voter (delegate if delegating, self if not)
        address effectiveVoter = delegationRegistry.getEffectiveVoter(_user);

        // Get token balance of effective voter
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", effectiveVoter));
        require(ok && data.length >= 32, "balance check failed");
        uint256 rawBalance = abi.decode(data, (uint256));
        return rawBalance / (10 ** tokenDecimals);
    }
}
