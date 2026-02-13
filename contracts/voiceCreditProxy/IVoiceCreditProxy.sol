// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IVoiceCreditProxy - Interface for voice credit allocation
/// @notice Implementations decide how many voice credits each user receives
interface IVoiceCreditProxy {
    /// @notice Get the number of voice credits for a user
    /// @param _user The user's address
    /// @param _data Additional data for credit calculation
    /// @return The number of voice credits
    function getVoiceCredits(address _user, bytes memory _data) external view returns (uint256);
}
