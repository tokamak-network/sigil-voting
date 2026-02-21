// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DelegationRegistry - Vote delegation management
/// @notice Allows users to delegate their voting power to another address
/// @dev Only 1-level delegation (no chains). Used with DelegatingVoiceCreditProxy.
contract DelegationRegistry {
    // delegator => delegate
    mapping(address => address) private _delegates;

    event Delegated(address indexed delegator, address indexed delegate);
    event Undelegated(address indexed delegator, address indexed previousDelegate);

    error SelfDelegation();
    error CircularDelegation();
    error NotDelegating();
    error AlreadyDelegatingToSame();

    /// @notice Delegate voting power to another address
    /// @param _to The address to delegate to
    function delegate(address _to) external {
        if (_to == msg.sender) revert SelfDelegation();
        if (_delegates[_to] == msg.sender) revert CircularDelegation();
        if (_delegates[msg.sender] == _to) revert AlreadyDelegatingToSame();
        _delegates[msg.sender] = _to;
        emit Delegated(msg.sender, _to);
    }

    /// @notice Remove delegation
    function undelegate() external {
        if (_delegates[msg.sender] == address(0)) revert NotDelegating();
        address prev = _delegates[msg.sender];
        delete _delegates[msg.sender];
        emit Undelegated(msg.sender, prev);
    }

    /// @notice Get the effective voter for an address
    /// @dev Returns the delegate if delegating, otherwise returns the address itself
    /// @param _user The address to check
    /// @return The effective voter address
    function getEffectiveVoter(address _user) external view returns (address) {
        address d = _delegates[_user];
        return d == address(0) ? _user : d;
    }

    /// @notice Check if an address is currently delegating
    /// @param _user The address to check
    /// @return True if the user is delegating
    function isDelegating(address _user) external view returns (bool) {
        return _delegates[_user] != address(0);
    }
}
