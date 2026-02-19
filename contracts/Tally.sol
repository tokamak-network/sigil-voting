// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Poll} from "./Poll.sol";
import {MessageProcessor} from "./MessageProcessor.sol";
import {DomainObjs} from "./DomainObjs.sol";
import {IVerifier} from "./IVerifier.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

/// @title Tally - Vote aggregation verification
/// @notice Verifies Groth16 proofs of correct vote tallying
/// @dev Tally commitment = poseidon_3([votesRoot, totalSpent, perOptionSpent])
contract Tally is DomainObjs {
    address public immutable poll;
    address public immutable messageProcessor;
    address public immutable verifier;
    address public immutable vkRegistry;
    address public immutable coordinator;

    // Tally commitment: poseidon_3([votesRoot, totalSpentVoiceCredits, perVoteOptionSpentRoot])
    uint256 public tallyCommitment;
    bool public tallyVerified;

    // Final results (set by publishResults)
    uint256 public forVotes;
    uint256 public againstVotes;
    uint256 public abstainVotes; // D1 only (D2 = 0)
    uint256 public totalVoters;

    error NotCoordinator();
    error ProcessingNotDone();
    error InvalidTallyProof();
    error TallyNotComputed();
    error TallyCommitmentMismatch();
    error AlreadyTallied();

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator();
        _;
    }

    event Tallied(uint256 indexed batchIndex, uint256 newTallyCommitment);
    event TallyPublished(
        uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 totalVoters, uint256 tallyCommitment
    );

    constructor(address _poll, address _mp, address _verifier, address _vkRegistry, address _coordinator) {
        poll = _poll;
        messageProcessor = _mp;
        verifier = _verifier;
        vkRegistry = _vkRegistry;
        coordinator = _coordinator;
    }

    /// @notice Verify a tally batch proof
    /// @param _newTallyCommitment The updated tally commitment
    /// @param _pA Groth16 proof element A
    /// @param _pB Groth16 proof element B
    /// @param _pC Groth16 proof element C
    function tallyVotes(
        uint256 _newTallyCommitment,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external onlyCoordinator {
        // 0. Prevent double tally
        if (tallyVerified) revert AlreadyTallied();

        // 1. Processing must be complete (cache external call)
        MessageProcessor _mp = MessageProcessor(messageProcessor);
        if (!_mp.processingComplete()) revert ProcessingNotDone();

        // 2. SHA256 public input hash
        uint256 publicInputHash = uint256(
            sha256(abi.encodePacked(_mp.currentStateCommitment(), tallyCommitment, _newTallyCommitment))
        ) & ((1 << 253) - 1);

        // 3. Groth16 verification
        uint256[] memory pubSignals = new uint256[](1);
        pubSignals[0] = publicInputHash;

        if (!IVerifier(verifier).verifyProof(_pA, _pB, _pC, pubSignals)) revert InvalidTallyProof();

        // 4. Update tally commitment
        tallyCommitment = _newTallyCommitment;

        emit Tallied(0, _newTallyCommitment);
    }

    /// @notice Publish final results after tally verification
    /// @param _forVotes Total votes for
    /// @param _againstVotes Total votes against
    /// @param _abstainVotes Total abstain votes (D1 only, 0 for D2)
    /// @param _totalVoters Total number of voters who participated
    /// @param _tallyResultsRoot Merkle root of per-option vote totals
    /// @param _totalSpent Total voice credits spent
    /// @param _perOptionSpentRoot Merkle root of per-option spent credits
    function publishResults(
        uint256 _forVotes,
        uint256 _againstVotes,
        uint256 _abstainVotes,
        uint256 _totalVoters,
        uint256 _tallyResultsRoot,
        uint256 _totalSpent,
        uint256 _perOptionSpentRoot
    ) external onlyCoordinator {
        if (tallyCommitment == 0) revert TallyNotComputed();
        if (tallyVerified) revert AlreadyTallied();
        // Verify: poseidon_3(tallyResultsRoot, totalSpent, perOptionSpentRoot) == tallyCommitment
        uint256 computedCommitment = PoseidonT4.hash([_tallyResultsRoot, _totalSpent, _perOptionSpentRoot]);
        if (computedCommitment != tallyCommitment) revert TallyCommitmentMismatch();

        forVotes = _forVotes;
        againstVotes = _againstVotes;
        abstainVotes = _abstainVotes;
        totalVoters = _totalVoters;
        tallyVerified = true;

        emit TallyPublished(_forVotes, _againstVotes, _abstainVotes, _totalVoters, tallyCommitment);
    }
}
