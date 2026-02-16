// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Poll} from "./Poll.sol";
import {AccQueue} from "./AccQueue.sol";
import {DomainObjs} from "./DomainObjs.sol";
import {IVerifier} from "./IVerifier.sol";

/// @title MessageProcessor - State transition proof verification
/// @notice Verifies Groth16 proofs that messages were correctly processed
/// @dev Uses SHA256-compressed public inputs for gas efficiency
contract MessageProcessor is DomainObjs {
    address public immutable poll;
    address public immutable verifier;
    address public immutable vkRegistry;
    address public immutable coordinator;

    uint256 public processedBatchCount;
    uint256 public currentStateCommitment;
    bool public processingComplete;

    error NotCoordinator();
    error VotingStillOpen();
    error StateAqNotMerged();
    error MessageAqNotMerged();
    error AlreadyComplete();
    error NoBatchesProcessed();
    error InvalidProcessProof();

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator();
        _;
    }

    event MessagesProcessed(uint256 indexed batchIndex, uint256 newStateCommitment);
    event ProcessingCompleted(uint256 finalStateCommitment);

    constructor(address _poll, address _verifier, address _vkRegistry, address _coordinator) {
        poll = _poll;
        verifier = _verifier;
        vkRegistry = _vkRegistry;
        coordinator = _coordinator;
    }

    /// @notice Verify a batch of processed messages
    /// @param _newStateCommitment The state commitment after processing this batch
    /// @param _pA Groth16 proof element A
    /// @param _pB Groth16 proof element B
    /// @param _pC Groth16 proof element C
    function processMessages(
        uint256 _newStateCommitment,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external onlyCoordinator {
        // Cache Poll reference
        Poll _poll = Poll(poll);

        // 1. Voting must be over
        if (_poll.isVotingOpen()) revert VotingStillOpen();

        // 2. AccQueues must be merged
        if (!_poll.stateAqMerged()) revert StateAqNotMerged();
        if (!_poll.messageAqMerged()) revert MessageAqNotMerged();

        // 3. Not already complete
        if (processingComplete) revert AlreadyComplete();

        // 4. SHA256 public input hash (cached external calls)
        uint256 messageRoot = AccQueue(address(_poll.messageAq())).mainRoot();
        uint256 publicInputHash = uint256(
            sha256(abi.encodePacked(currentStateCommitment, _newStateCommitment, messageRoot, _poll.numMessages()))
        ) % SNARK_SCALAR_FIELD;

        // 5. Groth16 verification
        uint256[] memory pubSignals = new uint256[](1);
        pubSignals[0] = publicInputHash;

        if (!IVerifier(verifier).verifyProof(_pA, _pB, _pC, pubSignals)) revert InvalidProcessProof();

        // 6. Update state
        currentStateCommitment = _newStateCommitment;
        processedBatchCount++;

        emit MessagesProcessed(processedBatchCount - 1, _newStateCommitment);
    }

    /// @notice Mark processing as complete (called after all batches processed)
    function completeProcessing() external onlyCoordinator {
        if (processingComplete) revert AlreadyComplete();
        if (processedBatchCount == 0) revert NoBatchesProcessed();
        processingComplete = true;
        emit ProcessingCompleted(currentStateCommitment);
    }
}
