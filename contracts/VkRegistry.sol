// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VkRegistry - Verification Key Registry
/// @notice Stores verification keys for different circuit configurations
contract VkRegistry {
    address public immutable owner;

    // Keyed by keccak256(stateTreeDepth, messageTreeDepth)
    mapping(bytes32 => uint256[]) public processVks;
    mapping(bytes32 => uint256[]) public tallyVks;
    mapping(bytes32 => bool) public isProcessVkSet;
    mapping(bytes32 => bool) public isTallyVkSet;

    error NotOwner();
    error ProcessVkNotSet();
    error TallyVkNotSet();

    event ProcessVkSet(uint256 stateTreeDepth, uint256 messageTreeDepth);
    event TallyVkSet(uint256 stateTreeDepth, uint256 messageTreeDepth);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Register verification keys for a circuit configuration
    function setVerifyingKeys(
        uint256 _stateTreeDepth,
        uint256 _messageTreeDepth,
        uint256[] calldata _processVk,
        uint256[] calldata _tallyVk
    ) external onlyOwner {
        bytes32 key = keccak256(abi.encodePacked(_stateTreeDepth, _messageTreeDepth));

        // Store process VK
        delete processVks[key];
        uint256 pLen = _processVk.length;
        for (uint256 i = 0; i < pLen;) {
            processVks[key].push(_processVk[i]);
            unchecked {
                ++i;
            }
        }
        isProcessVkSet[key] = true;
        emit ProcessVkSet(_stateTreeDepth, _messageTreeDepth);

        // Store tally VK
        delete tallyVks[key];
        uint256 tLen = _tallyVk.length;
        for (uint256 i = 0; i < tLen;) {
            tallyVks[key].push(_tallyVk[i]);
            unchecked {
                ++i;
            }
        }
        isTallyVkSet[key] = true;
        emit TallyVkSet(_stateTreeDepth, _messageTreeDepth);
    }

    /// @notice Get the process verification key
    function getProcessVk(uint256 _stateTreeDepth, uint256 _messageTreeDepth) external view returns (uint256[] memory) {
        bytes32 key = keccak256(abi.encodePacked(_stateTreeDepth, _messageTreeDepth));
        if (!isProcessVkSet[key]) revert ProcessVkNotSet();
        return processVks[key];
    }

    /// @notice Get the tally verification key
    function getTallyVk(uint256 _stateTreeDepth, uint256 _messageTreeDepth) external view returns (uint256[] memory) {
        bytes32 key = keccak256(abi.encodePacked(_stateTreeDepth, _messageTreeDepth));
        if (!isTallyVkSet[key]) revert TallyVkNotSet();
        return tallyVks[key];
    }
}
