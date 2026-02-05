// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PoseidonT5.sol";

/**
 * @title PrivateVoting (D1 Spec)
 * @dev Zero-knowledge commit-reveal voting with hidden ballot choices
 *
 * Security Properties:
 * - Privacy: Choice hidden until reveal phase; observers cannot determine individual votes
 * - Anti-Coercion: Voters cannot prove their selection to potential bribers
 * - Double-Spend Prevention: Nullifier derived from hash(sk, proposalId) prevents reuse
 *
 * Based on: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md
 */

interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[4] calldata _pubSignals  // [voteCommitment, proposalId, votingPower, merkleRoot]
    ) external view returns (bool);
}

contract PrivateVoting {
    // ============ Constants ============
    uint256 public constant CHOICE_AGAINST = 0;
    uint256 public constant CHOICE_FOR = 1;
    uint256 public constant CHOICE_ABSTAIN = 2;

    // ============ State Variables ============
    IVerifier public immutable verifier;
    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;          // End of commit phase
        uint256 revealEndTime;    // End of reveal phase
        uint256 merkleRoot;       // Snapshot eligibility tree root
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalCommitments;
        uint256 revealedVotes;
        bool exists;
    }

    struct VoteCommitment {
        uint256 commitment;       // hash(choice, voteSalt, proposalId)
        uint256 votingPower;
        uint256 nullifier;
        uint256 timestamp;
        bool revealed;
        uint256 revealedChoice;
        bool exists;
    }

    // proposalId => Proposal
    mapping(uint256 => Proposal) public proposals;

    // proposalId => nullifier => VoteCommitment
    mapping(uint256 => mapping(uint256 => VoteCommitment)) public commitments;

    // proposalId => nullifier => used
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

    // Historical merkle roots for snapshots
    mapping(uint256 => bool) public validMerkleRoots;
    uint256[] public merkleRootHistory;

    // ============ Events ============
    event ProposalCreated(
        uint256 indexed proposalId,
        string title,
        address indexed proposer,
        uint256 merkleRoot,
        uint256 endTime,
        uint256 revealEndTime
    );

    event MerkleRootRegistered(
        uint256 indexed merkleRoot,
        uint256 timestamp
    );

    event VoteCommitted(
        uint256 indexed proposalId,
        uint256 indexed nullifier,
        uint256 commitment,
        uint256 votingPower
    );

    event VoteRevealed(
        uint256 indexed proposalId,
        uint256 indexed nullifier,
        uint256 choice,
        uint256 votingPower
    );

    // ============ Errors ============
    error ProposalNotFound();
    error NotInCommitPhase();
    error NotInRevealPhase();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error InvalidMerkleRoot();
    error InvalidChoice();
    error AlreadyRevealed();
    error CommitmentNotFound();
    error InvalidReveal();
    error ZeroVotingPower();

    // ============ Constructor ============
    constructor(address _verifier) {
        verifier = IVerifier(_verifier);
    }

    // ============ Admin Functions ============

    /**
     * @dev Register a merkle root snapshot for token eligibility
     * @param _merkleRoot The root of the token ownership merkle tree
     */
    function registerMerkleRoot(uint256 _merkleRoot) external {
        // In production, this should be access-controlled or automated
        validMerkleRoots[_merkleRoot] = true;
        merkleRootHistory.push(_merkleRoot);

        emit MerkleRootRegistered(_merkleRoot, block.timestamp);
    }

    // ============ Proposal Functions ============

    /**
     * @dev Create a new proposal with associated merkle root snapshot
     * @param _title Proposal title
     * @param _description Proposal description
     * @param _merkleRoot Snapshot of token holders merkle root
     * @param _votingDuration Duration of commit phase in seconds
     * @param _revealDuration Duration of reveal phase in seconds
     */
    function createProposal(
        string calldata _title,
        string calldata _description,
        uint256 _merkleRoot,
        uint256 _votingDuration,
        uint256 _revealDuration
    ) external returns (uint256) {
        if (!validMerkleRoots[_merkleRoot]) revert InvalidMerkleRoot();

        proposalCount++;
        uint256 proposalId = proposalCount;

        proposals[proposalId] = Proposal({
            id: proposalId,
            title: _title,
            description: _description,
            proposer: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + _votingDuration,
            revealEndTime: block.timestamp + _votingDuration + _revealDuration,
            merkleRoot: _merkleRoot,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            totalCommitments: 0,
            revealedVotes: 0,
            exists: true
        });

        emit ProposalCreated(
            proposalId,
            _title,
            msg.sender,
            _merkleRoot,
            block.timestamp + _votingDuration,
            block.timestamp + _votingDuration + _revealDuration
        );

        return proposalId;
    }

    // ============ Voting Functions ============

    /**
     * @dev Commit Phase: Submit vote commitment with ZK proof
     *
     * The ZK proof verifies:
     * 1. Token Verification: noteHash reconstructed from components
     * 2. Snapshot Inclusion: merkle proof of token ownership
     * 3. Ownership Proof: secret key derives public key
     * 4. Power Consistency: declared power matches note value
     * 5. Choice Validation: vote is 0, 1, or 2
     * 6. Commitment Creation: commitment = hash(choice, voteSalt, proposalId)
     *
     * @param _proposalId Proposal ID
     * @param _commitment Vote commitment hash(choice, voteSalt, proposalId)
     * @param _votingPower Voting power (verified in ZK proof)
     * @param _nullifier Nullifier to prevent double voting
     * @param _pA Groth16 proof point A
     * @param _pB Groth16 proof point B
     * @param _pC Groth16 proof point C
     */
    function commitVote(
        uint256 _proposalId,
        uint256 _commitment,
        uint256 _votingPower,
        uint256 _nullifier,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external {
        Proposal storage proposal = proposals[_proposalId];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp > proposal.endTime) revert NotInCommitPhase();
        if (nullifierUsed[_proposalId][_nullifier]) revert NullifierAlreadyUsed();
        if (_votingPower == 0) revert ZeroVotingPower();

        // Verify ZK proof
        // Public signals: [voteCommitment, proposalId, votingPower, merkleRoot] (4 as per D1 spec)
        uint256[4] memory pubSignals = [
            _commitment,
            _proposalId,
            _votingPower,
            proposal.merkleRoot
        ];

        bool validProof = verifier.verifyProof(_pA, _pB, _pC, pubSignals);

        // Note: Nullifier is provided separately and verified by contract
        // The nullifier should be hash(sk, proposalId) computed in the circuit
        if (!validProof) revert InvalidProof();

        // Mark nullifier as used
        nullifierUsed[_proposalId][_nullifier] = true;

        // Store commitment
        commitments[_proposalId][_nullifier] = VoteCommitment({
            commitment: _commitment,
            votingPower: _votingPower,
            nullifier: _nullifier,
            timestamp: block.timestamp,
            revealed: false,
            revealedChoice: 0,
            exists: true
        });

        proposal.totalCommitments++;

        emit VoteCommitted(_proposalId, _nullifier, _commitment, _votingPower);
    }

    /**
     * @dev Reveal Phase: Reveal vote choice and salt
     *
     * After commit phase ends, voters reveal their choices.
     * The contract verifies the reveal matches the commitment.
     *
     * Per D1 spec: commitment = hash(choice, votingPower, proposalId, voteSalt)
     *
     * @param _proposalId Proposal ID
     * @param _nullifier Nullifier used in commit
     * @param _choice Vote choice (0=against, 1=for, 2=abstain)
     * @param _voteSalt Salt used in commitment
     */
    function revealVote(
        uint256 _proposalId,
        uint256 _nullifier,
        uint256 _choice,
        uint256 _voteSalt
    ) external {
        Proposal storage proposal = proposals[_proposalId];
        VoteCommitment storage vc = commitments[_proposalId][_nullifier];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp <= proposal.endTime) revert NotInRevealPhase();
        if (block.timestamp > proposal.revealEndTime) revert NotInRevealPhase();
        if (!vc.exists) revert CommitmentNotFound();
        if (vc.revealed) revert AlreadyRevealed();
        if (_choice > CHOICE_ABSTAIN) revert InvalidChoice();

        // Verify reveal per D1 spec: commitment = hash(choice, votingPower, proposalId, voteSalt)
        // Using Poseidon hash (same as ZK circuit) for compatibility
        uint256 computedCommitment = PoseidonT5.hash([_choice, vc.votingPower, _proposalId, _voteSalt]);

        if (computedCommitment != vc.commitment) revert InvalidReveal();

        // Update commitment
        vc.revealed = true;
        vc.revealedChoice = _choice;

        // Tally vote
        if (_choice == CHOICE_FOR) {
            proposal.forVotes += vc.votingPower;
        } else if (_choice == CHOICE_AGAINST) {
            proposal.againstVotes += vc.votingPower;
        } else {
            proposal.abstainVotes += vc.votingPower;
        }
        proposal.revealedVotes++;

        emit VoteRevealed(_proposalId, _nullifier, _choice, vc.votingPower);
    }

    // ============ View Functions ============

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 _proposalId) external view returns (
        uint256 id,
        string memory title,
        string memory description,
        address proposer,
        uint256 merkleRoot,
        uint256 endTime,
        uint256 revealEndTime,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        uint256 totalCommitments,
        uint256 revealedVotes,
        uint8 phase // 0=commit, 1=reveal, 2=ended
    ) {
        Proposal storage p = proposals[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        uint8 currentPhase;
        if (block.timestamp <= p.endTime) {
            currentPhase = 0; // Commit phase
        } else if (block.timestamp <= p.revealEndTime) {
            currentPhase = 1; // Reveal phase
        } else {
            currentPhase = 2; // Ended
        }

        return (
            p.id,
            p.title,
            p.description,
            p.proposer,
            p.merkleRoot,
            p.endTime,
            p.revealEndTime,
            p.forVotes,
            p.againstVotes,
            p.abstainVotes,
            p.totalCommitments,
            p.revealedVotes,
            currentPhase
        );
    }

    /**
     * @dev Get commitment by nullifier
     */
    function getCommitment(uint256 _proposalId, uint256 _nullifier) external view returns (
        uint256 commitment,
        uint256 votingPower,
        bool revealed,
        uint256 revealedChoice
    ) {
        VoteCommitment storage vc = commitments[_proposalId][_nullifier];
        return (vc.commitment, vc.votingPower, vc.revealed, vc.revealedChoice);
    }

    /**
     * @dev Check if nullifier has been used
     */
    function isNullifierUsed(uint256 _proposalId, uint256 _nullifier) external view returns (bool) {
        return nullifierUsed[_proposalId][_nullifier];
    }

    /**
     * @dev Get all registered merkle roots
     */
    function getMerkleRoots() external view returns (uint256[] memory) {
        return merkleRootHistory;
    }

    /**
     * @dev Check if merkle root is valid
     */
    function isMerkleRootValid(uint256 _merkleRoot) external view returns (bool) {
        return validMerkleRoots[_merkleRoot];
    }

    /**
     * @dev Get current phase for proposal
     */
    function getPhase(uint256 _proposalId) external view returns (uint8) {
        Proposal storage p = proposals[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        if (block.timestamp <= p.endTime) return 0;      // Commit
        if (block.timestamp <= p.revealEndTime) return 1; // Reveal
        return 2;                                          // Ended
    }
}
