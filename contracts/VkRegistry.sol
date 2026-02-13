// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VkRegistry - Verification Key Registry
/// @notice Stores verification keys for different circuit configurations
contract VkRegistry {
    address public owner;

    // Keyed by keccak256(stateTreeDepth, messageTreeDepth)
    mapping(bytes32 => uint256[]) public processVks;
    mapping(bytes32 => uint256[]) public tallyVks;
    mapping(bytes32 => bool) public isProcessVkSet;
    mapping(bytes32 => bool) public isTallyVkSet;

    event ProcessVkSet(uint256 stateTreeDepth, uint256 messageTreeDepth);
    event TallyVkSet(uint256 stateTreeDepth, uint256 messageTreeDepth);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
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
        for (uint256 i = 0; i < _processVk.length; i++) {
            processVks[key].push(_processVk[i]);
        }
        isProcessVkSet[key] = true;
        emit ProcessVkSet(_stateTreeDepth, _messageTreeDepth);

        // Store tally VK
        delete tallyVks[key];
        for (uint256 i = 0; i < _tallyVk.length; i++) {
            tallyVks[key].push(_tallyVk[i]);
        }
        isTallyVkSet[key] = true;
        emit TallyVkSet(_stateTreeDepth, _messageTreeDepth);
    }

    /// @notice Get the process verification key
    function getProcessVk(uint256 _stateTreeDepth, uint256 _messageTreeDepth) external view returns (uint256[] memory) {
        bytes32 key = keccak256(abi.encodePacked(_stateTreeDepth, _messageTreeDepth));
        require(isProcessVkSet[key], "Process VK not set");
        return processVks[key];
    }

    /// @notice Get the tally verification key
    function getTallyVk(uint256 _stateTreeDepth, uint256 _messageTreeDepth) external view returns (uint256[] memory) {
        bytes32 key = keccak256(abi.encodePacked(_stateTreeDepth, _messageTreeDepth));
        require(isTallyVkSet[key], "Tally VK not set");
        return tallyVks[key];
    }
}
