// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DelegationRegistry - Vote delegation management
/// @notice Allows users to delegate their voting power to another address
/// @dev Only 1-level delegation (no chains). Delegate votes with combined power.
contract DelegationRegistry {
    // delegator => delegate
    mapping(address => address) private _delegates;
    // delegate => list of delegators (for aggregation)
    mapping(address => address[]) private _delegators;
    // delegator => index in _delegators array (for O(1) removal)
    mapping(address => uint256) private _delegatorIndex;

    event Delegated(address indexed delegator, address indexed delegate);
    event Undelegated(address indexed delegator, address indexed previousDelegate);

    error SelfDelegation();
    error CircularDelegation();
    error NotDelegating();
    error AlreadyDelegatingToSame();
    error DelegatorCannotVote();

    /// @notice Delegate voting power to another address
    /// @param _to The address to delegate to
    function delegate(address _to) external {
        if (_to == msg.sender) revert SelfDelegation();
        if (_delegates[_to] == msg.sender) revert CircularDelegation();
        if (_delegates[msg.sender] == _to) revert AlreadyDelegatingToSame();

        // Remove from previous delegate's list if re-delegating
        address prev = _delegates[msg.sender];
        if (prev != address(0)) {
            _removeDelegator(prev, msg.sender);
        }

        _delegates[msg.sender] = _to;
        _delegatorIndex[msg.sender] = _delegators[_to].length;
        _delegators[_to].push(msg.sender);
        emit Delegated(msg.sender, _to);
    }

    /// @notice Remove delegation
    function undelegate() external {
        address prev = _delegates[msg.sender];
        if (prev == address(0)) revert NotDelegating();
        _removeDelegator(prev, msg.sender);
        delete _delegates[msg.sender];
        delete _delegatorIndex[msg.sender];
        emit Undelegated(msg.sender, prev);
    }

    /// @notice Get list of addresses that delegated to this user
    /// @param _delegate The delegate address
    /// @return Array of delegator addresses
    function getDelegators(address _delegate) external view returns (address[] memory) {
        return _delegators[_delegate];
    }

    /// @notice Check if an address is currently delegating
    /// @param _user The address to check
    /// @return True if the user is delegating
    function isDelegating(address _user) external view returns (bool) {
        return _delegates[_user] != address(0);
    }

    /// @notice Get who a user has delegated to
    /// @param _user The delegator address
    /// @return The delegate address (address(0) if not delegating)
    function getDelegate(address _user) external view returns (address) {
        return _delegates[_user];
    }

    /// @dev Remove delegator from delegate's array using swap-and-pop
    function _removeDelegator(address _delegate, address _delegator) internal {
        address[] storage arr = _delegators[_delegate];
        uint256 idx = _delegatorIndex[_delegator];
        uint256 lastIdx = arr.length - 1;
        if (idx != lastIdx) {
            address last = arr[lastIdx];
            arr[idx] = last;
            _delegatorIndex[last] = idx;
        }
        arr.pop();
    }
}
