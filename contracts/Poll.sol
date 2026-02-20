// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccQueue} from "./AccQueue.sol";
import {DomainObjs} from "./DomainObjs.sol";
import {PoseidonT5} from "./PoseidonT5.sol";
import {PoseidonT6} from "poseidon-solidity/PoseidonT6.sol";

/// @title Poll - Voting contract for a single poll
/// @notice Handles encrypted message submission and AccQueue merge operations
/// @dev No revealVote - votes are encrypted with DuplexSponge and never revealed on-chain
contract Poll is DomainObjs {
    // ============ Errors ============
    error VotingEnded();
    error VotingNotEnded();
    error ZeroStateAq();
    error ZeroDuration();
    error ZeroEncPubKey();

    // ============ Config ============
    string public title;
    uint256 public immutable deployTime;
    uint256 public immutable duration;
    uint256 public immutable coordinatorPubKeyX;
    uint256 public immutable coordinatorPubKeyY;

    // ============ AccQueues ============
    AccQueue public messageAq;
    address public stateAqAddr;
    uint256 public numSignUpsAtDeployment;

    // ============ State ============
    uint256 public numMessages;
    bool public stateAqMerged;
    bool public messageAqMerged;

    // ============ Events ============
    event MessagePublished(
        uint256 indexed messageIndex, uint256[10] encMessage, uint256 encPubKeyX, uint256 encPubKeyY
    );

    // ============ Constructor ============
    constructor(
        string memory _title,
        uint256 _duration,
        uint256 _coordPubKeyX,
        uint256 _coordPubKeyY,
        address _stateAq,
        uint256 _numSignUps,
        uint8 _messageTreeDepth
    ) {
        if (_stateAq == address(0)) revert ZeroStateAq();
        if (_duration == 0) revert ZeroDuration();

        title = _title;
        deployTime = block.timestamp;
        duration = _duration;
        coordinatorPubKeyX = _coordPubKeyX;
        coordinatorPubKeyY = _coordPubKeyY;
        stateAqAddr = _stateAq;
        numSignUpsAtDeployment = _numSignUps;

        // Message AccQueue (quinary, subDepth=2)
        messageAq = new AccQueue(5, _messageTreeDepth);
    }

    /// @notice Submit an encrypted vote message
    /// @param _encMessage DuplexSponge encrypted message (10 field elements)
    /// @param _encPubKeyX Ephemeral public key X (for ECDH)
    /// @param _encPubKeyY Ephemeral public key Y
    function publishMessage(uint256[10] calldata _encMessage, uint256 _encPubKeyX, uint256 _encPubKeyY) external {
        if (block.timestamp > deployTime + duration) revert VotingEnded();
        if (_encPubKeyX == 0 && _encPubKeyY == 0) revert ZeroEncPubKey();

        // Hash message + pubkey into a single leaf
        uint256 leaf = hashMessageAndEncPubKey(_encMessage, _encPubKeyX, _encPubKeyY);

        // Enqueue into Message AccQueue
        messageAq.enqueue(leaf);

        emit MessagePublished(numMessages, _encMessage, _encPubKeyX, _encPubKeyY);
        numMessages++;
    }

    // ============ AccQueue Merge (post-voting) ============

    /// @notice Merge State AccQueue subtree roots
    /// @dev Uses try/catch because State AccQueue is shared across all polls.
    ///      If a previous poll already merged it, we skip gracefully.
    function mergeMaciStateAqSubRoots(uint256 _numSrQueueOps) external {
        if (block.timestamp <= deployTime + duration) revert VotingNotEnded();
        AccQueue aq = AccQueue(stateAqAddr);
        if (!aq.subRootsMerged()) {
            aq.mergeSubRoots(_numSrQueueOps);
        }
    }

    /// @notice Finalize State AccQueue main root
    /// @dev Skips if already merged by a previous poll. Always sets stateAqMerged.
    function mergeMaciStateAq() external {
        if (block.timestamp <= deployTime + duration) revert VotingNotEnded();
        AccQueue aq = AccQueue(stateAqAddr);
        if (!aq.merged()) {
            if (!aq.subRootsMerged()) {
                aq.mergeSubRoots(0);
            }
            aq.merge();
        }
        stateAqMerged = true;
    }

    /// @notice Merge Message AccQueue subtree roots
    function mergeMessageAqSubRoots(uint256 _numSrQueueOps) external {
        if (block.timestamp <= deployTime + duration) revert VotingNotEnded();
        if (!messageAq.subRootsMerged()) {
            messageAq.mergeSubRoots(_numSrQueueOps);
        }
    }

    /// @notice Finalize Message AccQueue main root
    function mergeMessageAq() external {
        if (block.timestamp <= deployTime + duration) revert VotingNotEnded();
        if (!messageAq.merged()) {
            if (!messageAq.subRootsMerged()) {
                messageAq.mergeSubRoots(0);
            }
            messageAq.merge();
        }
        messageAqMerged = true;
    }

    // ============ View Functions ============

    /// @notice Check if voting is still open
    function isVotingOpen() external view returns (bool) {
        return block.timestamp <= deployTime + duration;
    }

    /// @notice Get deploy time and duration
    function getDeployTimeAndDuration() external view returns (uint256, uint256) {
        return (deployTime, duration);
    }

    /// @notice Hash a message and its ephemeral public key into a single leaf
    /// @dev 12 inputs → 3-stage Poseidon: hash5(msg[0..4]), hash5(msg[5..9]), hash4(h1, h2, pkX, pkY)
    function hashMessageAndEncPubKey(uint256[10] calldata _msg, uint256 _encPubKeyX, uint256 _encPubKeyY)
        public
        pure
        returns (uint256)
    {
        uint256 h1 = PoseidonT6.hash([_msg[0], _msg[1], _msg[2], _msg[3], _msg[4]]);
        uint256 h2 = PoseidonT6.hash([_msg[5], _msg[6], _msg[7], _msg[8], _msg[9]]);
        return PoseidonT5.hash([h1, h2, _encPubKeyX, _encPubKeyY]);
    }
}
