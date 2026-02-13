// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISignUpGatekeeper} from "./ISignUpGatekeeper.sol";

/// @title FreeForAllGatekeeper - No restrictions on signup
/// @notice Everyone is allowed to register (default implementation)
contract FreeForAllGatekeeper is ISignUpGatekeeper {
    /// @notice Always succeeds - no restrictions
    function register(address, bytes memory) external override {
        // No restrictions
    }
}
