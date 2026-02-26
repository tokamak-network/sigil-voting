// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVoiceCreditProxy} from "./IVoiceCreditProxy.sol";

/// @title ConfigurableVoiceCreditProxy - Configurable token-based voice credit allocation
/// @notice Owner can set the token address until explicitly locked (before any signUp).
/// @dev Designed for multi-DAO reuse: deploy once, call setToken(), then lock() when ready.
///      Deploy order: proxy first → MACI (with proxy address) → call lock() before signUps open.
///      MACI.updateVoiceCreditProxy() can also point an existing MACI at a new proxy.
contract ConfigurableVoiceCreditProxy is IVoiceCreditProxy {
    address public token;
    uint8 public tokenDecimals;
    address public owner;

    /// @notice When true, setToken() is permanently disabled to protect voter fairness
    bool public locked;

    error NotOwner();
    error ZeroAddress();
    error AlreadyLocked();
    error TokenNotSet();

    event TokenUpdated(address indexed oldToken, address indexed newToken);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Locked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param _token Initial ERC20 token address (address(0) to defer until setToken())
    constructor(address _token) {
        owner = msg.sender;
        if (_token != address(0)) {
            _applyToken(_token);
        }
    }

    /// @notice Set or update the ERC20 token used for voice credit calculation
    /// @dev Reverts once locked. Must be called before MACI accepts any signUps.
    /// @param _token New ERC20 token address
    function setToken(address _token) external onlyOwner {
        if (locked) revert AlreadyLocked();
        if (_token == address(0)) revert ZeroAddress();
        _applyToken(_token);
    }

    /// @notice Permanently lock the token — no further changes allowed
    /// @dev Call this after the DAO token is set and before signUps open, or have MACI
    ///      owner call it right after MACI.init().
    function lock() external onlyOwner {
        if (locked) revert AlreadyLocked();
        locked = true;
        emit Locked();
    }

    /// @notice Transfer ownership of this proxy
    function transferOwnership(address _newOwner) external onlyOwner {
        if (_newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    /// @notice Returns the user's token balance as voice credits (whole tokens)
    /// @dev 1000.5 TOKEN → 1000 credits (floor division)
    function getVoiceCredits(address _user, bytes memory) external view override returns (uint256) {
        if (token == address(0)) revert TokenNotSet();
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", _user));
        require(ok && data.length >= 32, "balance check failed");
        uint256 rawBalance = abi.decode(data, (uint256));
        return rawBalance / (10 ** tokenDecimals);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _applyToken(address _token) internal {
        (bool ok, bytes memory data) = _token.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && data.length >= 32, "decimals failed");
        address old = token;
        token = _token;
        tokenDecimals = abi.decode(data, (uint8));
        emit TokenUpdated(old, _token);
    }
}
