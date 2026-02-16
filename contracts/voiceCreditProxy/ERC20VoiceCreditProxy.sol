// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVoiceCreditProxy} from "./IVoiceCreditProxy.sol";

/// @title ERC20VoiceCreditProxy - Token-based credit allocation
/// @notice Voice credits = user's ERC20 token balance (normalized to whole tokens)
/// @dev 1000 TON (18 decimals) → 1000 credits
contract ERC20VoiceCreditProxy is IVoiceCreditProxy {
    address public immutable token;
    uint8 public immutable tokenDecimals;

    constructor(address _token) {
        require(_token != address(0), "zero token");
        token = _token;

        // Cache decimals at deploy time
        (bool ok, bytes memory data) = _token.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && data.length >= 32, "decimals failed");
        tokenDecimals = abi.decode(data, (uint8));
    }

    /// @notice Returns the user's token balance as voice credits (whole tokens)
    /// @dev 1000.5 TON → 1000 credits (floor division)
    function getVoiceCredits(address _user, bytes memory) external view override returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", _user));
        require(ok && data.length >= 32, "balance check failed");
        uint256 rawBalance = abi.decode(data, (uint256));
        return rawBalance / (10 ** tokenDecimals);
    }
}
