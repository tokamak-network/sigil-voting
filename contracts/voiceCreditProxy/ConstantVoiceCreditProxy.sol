// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVoiceCreditProxy} from "./IVoiceCreditProxy.sol";

/// @title ConstantVoiceCreditProxy - Fixed credit allocation
/// @notice Every user receives the same amount of voice credits
contract ConstantVoiceCreditProxy is IVoiceCreditProxy {
    uint256 public immutable creditAmount;

    constructor(uint256 _amount) {
        creditAmount = _amount;
    }

    /// @notice Returns the fixed credit amount for any user
    function getVoiceCredits(address, bytes memory) external view override returns (uint256) {
        return creditAmount;
    }
}
