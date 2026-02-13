// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISignUpGatekeeper - Interface for signup access control
/// @notice Implementations decide who can register as a voter
interface ISignUpGatekeeper {
    /// @notice Check if a user is allowed to sign up
    /// @param _user The address attempting to register
    /// @param _data Additional data for gatekeeper logic
    function register(address _user, bytes memory _data) external;
}
