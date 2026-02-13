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

    uint256 public processedBatchCount;
    uint256 public currentStateCommitment;
    bool public processingComplete;

    event MessagesProcessed(uint256 indexed batchIndex, uint256 newStateCommitment);
    event ProcessingCompleted(uint256 finalStateCommitment);

    constructor(address _poll, address _verifier, address _vkRegistry) {
        poll = _poll;
        verifier = _verifier;
        vkRegistry = _vkRegistry;
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
    ) external {
        // 1. Voting must be over
        require(!Poll(poll).isVotingOpen(), "Voting still open");

        // 2. AccQueues must be merged
        require(Poll(poll).stateAqMerged(), "State AQ not merged");
        require(Poll(poll).messageAqMerged(), "Message AQ not merged");

        // 3. Not already complete
        require(!processingComplete, "Already complete");

        // 4. SHA256 public input hash
        uint256 messageRoot = AccQueue(address(Poll(poll).messageAq())).mainRoot();
        uint256 publicInputHash = uint256(
            sha256(
                abi.encodePacked(
                    currentStateCommitment,
                    _newStateCommitment,
                    messageRoot,
                    Poll(poll).numMessages()
                )
            )
        ) % SNARK_SCALAR_FIELD;

        // 5. Groth16 verification
        uint256[] memory pubSignals = new uint256[](1);
        pubSignals[0] = publicInputHash;

        bool valid = IVerifier(verifier).verifyProof(_pA, _pB, _pC, pubSignals);
        require(valid, "Invalid process proof");

        // 6. Update state
        currentStateCommitment = _newStateCommitment;
        processedBatchCount++;

        emit MessagesProcessed(processedBatchCount - 1, _newStateCommitment);
    }

    /// @notice Mark processing as complete (called after all batches processed)
    function completeProcessing() external {
        require(!processingComplete, "Already complete");
        require(processedBatchCount > 0, "No batches processed");
        processingComplete = true;
        emit ProcessingCompleted(currentStateCommitment);
    }
}
