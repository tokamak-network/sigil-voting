// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PoseidonT5.sol";

/**
 * @title QuadraticVoting (D2 Spec)
 * @dev Zero-knowledge quadratic voting to prevent whale domination
 *
 * Core Mechanism:
 * - Vote cost = numVotes^2 (quadratic cost)
 * - 1 vote = 1 credit, 10 votes = 100 credits, 100 votes = 10,000 credits
 * - This makes it exponentially expensive for whales to dominate
 *
 * Security Properties:
 * - Privacy: Choice hidden until reveal phase
 * - Anti-Whale: Quadratic cost prevents vote buying at scale
 * - Double-Spend Prevention: Nullifier prevents reuse
 */

interface IVerifierD2 {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[5] calldata _pubSignals // [nullifier, voteCommitment, proposalId, creditsSpent, creditRoot]
    ) external view returns (bool);
}

contract QuadraticVoting {
    // ============ Constants ============
    uint256 public constant CHOICE_AGAINST = 0;
    uint256 public constant CHOICE_FOR = 1;
    uint256 public constant CHOICE_ABSTAIN = 2;
    uint256 public constant INITIAL_CREDITS = 10000; // Each user starts with 10,000 credits

    // ============ State Variables ============
    IVerifierD2 public immutable verifier;
    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;
        uint256 revealEndTime;
        uint256 creditRoot;
        uint256 forVotes;      // Total vote COUNT (not credits)
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalCreditsSpent;
        uint256 totalCommitments;
        uint256 revealedVotes;
        bool exists;
    }

    struct VoteCommitment {
        uint256 commitment;
        uint256 creditsSpent;   // Quadratic cost
        uint256 numVotes;       // Actual vote count
        uint256 nullifier;
        uint256 timestamp;
        bool revealed;
        uint256 revealedChoice;
        bool exists;
    }

    struct UserCredits {
        uint256 totalCredits;
        uint256 usedCredits;
        bool initialized;
    }

    // proposalId => Proposal
    mapping(uint256 => Proposal) public proposals;

    // proposalId => nullifier => VoteCommitment
    mapping(uint256 => mapping(uint256 => VoteCommitment)) public commitments;

    // proposalId => nullifier => used
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

    // Credit roots for snapshots
    mapping(uint256 => bool) public validCreditRoots;
    uint256[] public creditRootHistory;

    // User credit balances (address => credits)
    mapping(address => UserCredits) public userCredits;

    // Credit note registry (similar to voter registry in D1)
    uint256[] public registeredCreditNotes;
    mapping(uint256 => bool) public isCreditNoteRegistered;

    // ============ Events ============
    event ProposalCreated(
        uint256 indexed proposalId,
        string title,
        address indexed proposer,
        uint256 creditRoot,
        uint256 endTime,
        uint256 revealEndTime
    );

    event CreditRootRegistered(uint256 indexed creditRoot, uint256 timestamp);
    event CreditNoteRegistered(uint256 indexed creditNoteHash, uint256 timestamp);
    event CreditsInitialized(address indexed user, uint256 credits);
    event CreditsBurned(address indexed user, uint256 amount, uint256 remaining);

    event VoteCommitted(
        uint256 indexed proposalId,
        uint256 indexed nullifier,
        uint256 commitment,
        uint256 numVotes,
        uint256 creditsSpent
    );

    event VoteRevealed(
        uint256 indexed proposalId,
        uint256 indexed nullifier,
        uint256 choice,
        uint256 numVotes,
        uint256 creditsSpent
    );

    // ============ Errors ============
    error ProposalNotFound();
    error NotInCommitPhase();
    error NotInRevealPhase();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error InvalidCreditRoot();
    error InvalidChoice();
    error AlreadyRevealed();
    error CommitmentNotFound();
    error InvalidReveal();
    error InsufficientCredits();
    error InvalidQuadraticCost();

    // ============ Constructor ============
    constructor(address _verifier) {
        verifier = IVerifierD2(_verifier);
    }

    // ============ Credit Management ============

    /**
     * @dev Initialize user credits (called on first interaction)
     */
    function initializeCredits() external {
        if (!userCredits[msg.sender].initialized) {
            userCredits[msg.sender] = UserCredits({
                totalCredits: INITIAL_CREDITS,
                usedCredits: 0,
                initialized: true
            });
            emit CreditsInitialized(msg.sender, INITIAL_CREDITS);
        }
    }

    /**
     * @dev Get user's available credits
     */
    function getAvailableCredits(address user) external view returns (uint256) {
        UserCredits storage uc = userCredits[user];
        if (!uc.initialized) return INITIAL_CREDITS;
        return uc.totalCredits - uc.usedCredits;
    }

    /**
     * @dev Calculate quadratic cost for given vote count
     */
    function calculateQuadraticCost(uint256 numVotes) public pure returns (uint256) {
        return numVotes * numVotes;
    }

    /**
     * @dev Calculate max votes possible with given credits
     */
    function calculateMaxVotes(uint256 availableCredits) public pure returns (uint256) {
        if (availableCredits == 0) return 0;
        // sqrt(availableCredits) - using simple iteration for small numbers
        uint256 x = availableCredits;
        uint256 y = (x + 1) / 2;
        while (y < x) {
            x = y;
            y = (x + availableCredits / x) / 2;
        }
        return x;
    }

    // ============ Admin Functions ============

    /**
     * @dev Register a credit merkle root
     */
    function registerCreditRoot(uint256 _creditRoot) external {
        validCreditRoots[_creditRoot] = true;
        creditRootHistory.push(_creditRoot);
        emit CreditRootRegistered(_creditRoot, block.timestamp);
    }

    /**
     * @dev Register a credit note hash
     */
    function registerCreditNote(uint256 _creditNoteHash) external {
        if (isCreditNoteRegistered[_creditNoteHash]) return;
        isCreditNoteRegistered[_creditNoteHash] = true;
        registeredCreditNotes.push(_creditNoteHash);
        emit CreditNoteRegistered(_creditNoteHash, block.timestamp);
    }

    /**
     * @dev Get all registered credit notes
     */
    function getRegisteredCreditNotes() external view returns (uint256[] memory) {
        return registeredCreditNotes;
    }

    // ============ Proposal Functions ============

    /**
     * @dev Create a quadratic voting proposal
     */
    function createProposal(
        string calldata _title,
        string calldata _description,
        uint256 _creditRoot,
        uint256 _votingDuration,
        uint256 _revealDuration
    ) external returns (uint256) {
        if (!validCreditRoots[_creditRoot]) revert InvalidCreditRoot();

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
            creditRoot: _creditRoot,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            totalCreditsSpent: 0,
            totalCommitments: 0,
            revealedVotes: 0,
            exists: true
        });

        emit ProposalCreated(
            proposalId,
            _title,
            msg.sender,
            _creditRoot,
            block.timestamp + _votingDuration,
            block.timestamp + _votingDuration + _revealDuration
        );

        return proposalId;
    }

    /**
     * @dev Update proposal credit root
     */
    function updateProposalCredits(uint256 _proposalId, uint256 _newCreditRoot) external {
        Proposal storage proposal = proposals[_proposalId];
        if (!proposal.exists) revert ProposalNotFound();

        proposal.creditRoot = _newCreditRoot;

        if (!validCreditRoots[_newCreditRoot]) {
            validCreditRoots[_newCreditRoot] = true;
            creditRootHistory.push(_newCreditRoot);
        }
    }

    // ============ Voting Functions ============

    /**
     * @dev Commit Phase: Submit quadratic vote with ZK proof
     *
     * The ZK proof verifies:
     * 1. Credit Note Verification: creditNoteHash from components
     * 2. Merkle Inclusion: proof of credit ownership
     * 3. Ownership Proof: sk derives pk
     * 4. QUADRATIC COST: creditsSpent === numVotes^2
     * 5. Balance Check: voteCost <= totalCredits
     * 6. Choice Validation: 0, 1, or 2
     * 7. Commitment Creation
     */
    function commitVoteQuadratic(
        uint256 _proposalId,
        uint256 _commitment,
        uint256 _numVotes,
        uint256 _creditsSpent,
        uint256 _nullifier,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external {
        Proposal storage proposal = proposals[_proposalId];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp > proposal.endTime) revert NotInCommitPhase();
        if (nullifierUsed[_proposalId][_nullifier]) revert NullifierAlreadyUsed();

        // Verify quadratic cost: creditsSpent MUST equal numVotes^2
        uint256 expectedCost = calculateQuadraticCost(_numVotes);
        if (_creditsSpent != expectedCost) revert InvalidQuadraticCost();

        // Verify ZK proof
        // Public signals: [nullifier, voteCommitment, proposalId, creditsSpent, creditRoot]
        uint256[5] memory pubSignals = [_nullifier, _commitment, _proposalId, _creditsSpent, proposal.creditRoot];

        bool validProof = verifier.verifyProof(_pA, _pB, _pC, pubSignals);
        if (!validProof) revert InvalidProof();

        // Initialize user credits if needed
        if (!userCredits[msg.sender].initialized) {
            userCredits[msg.sender] = UserCredits({
                totalCredits: INITIAL_CREDITS,
                usedCredits: 0,
                initialized: true
            });
        }

        // Check and burn credits
        UserCredits storage uc = userCredits[msg.sender];
        uint256 available = uc.totalCredits - uc.usedCredits;
        if (_creditsSpent > available) revert InsufficientCredits();

        uc.usedCredits += _creditsSpent;
        emit CreditsBurned(msg.sender, _creditsSpent, uc.totalCredits - uc.usedCredits);

        // Mark nullifier as used
        nullifierUsed[_proposalId][_nullifier] = true;

        // Store commitment
        commitments[_proposalId][_nullifier] = VoteCommitment({
            commitment: _commitment,
            creditsSpent: _creditsSpent,
            numVotes: _numVotes,
            nullifier: _nullifier,
            timestamp: block.timestamp,
            revealed: false,
            revealedChoice: 0,
            exists: true
        });

        proposal.totalCommitments++;
        proposal.totalCreditsSpent += _creditsSpent;

        emit VoteCommitted(_proposalId, _nullifier, _commitment, _numVotes, _creditsSpent);
    }

    /**
     * @dev Reveal Phase: Reveal vote
     *
     * commitment = hash(choice, numVotes, creditsSpent, proposalId, voteSalt)
     */
    function revealVote(
        uint256 _proposalId,
        uint256 _nullifier,
        uint256 _choice,
        uint256 _numVotes,
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

        // Verify reveal: commitment = hash(hash(choice, numVotes, creditsSpent, proposalId), voteSalt, 0, 0)
        uint256 inner = PoseidonT5.hash([_choice, _numVotes, vc.creditsSpent, _proposalId]);
        uint256 computedCommitment = PoseidonT5.hash([inner, _voteSalt, uint256(0), uint256(0)]);

        if (computedCommitment != vc.commitment) revert InvalidReveal();

        // Update commitment
        vc.revealed = true;
        vc.revealedChoice = _choice;

        // Tally votes (using numVotes, not creditsSpent!)
        if (_choice == CHOICE_FOR) {
            proposal.forVotes += _numVotes;
        } else if (_choice == CHOICE_AGAINST) {
            proposal.againstVotes += _numVotes;
        } else {
            proposal.abstainVotes += _numVotes;
        }
        proposal.revealedVotes++;

        emit VoteRevealed(_proposalId, _nullifier, _choice, _numVotes, vc.creditsSpent);
    }

    // ============ View Functions ============

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 _proposalId)
        external
        view
        returns (
            uint256 id,
            string memory title,
            string memory description,
            address proposer,
            uint256 creditRoot,
            uint256 endTime,
            uint256 revealEndTime,
            uint256 forVotes,
            uint256 againstVotes,
            uint256 abstainVotes,
            uint256 totalCreditsSpent,
            uint256 totalCommitments,
            uint256 revealedVotes,
            uint8 phase
        )
    {
        Proposal storage p = proposals[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        uint8 currentPhase;
        if (block.timestamp <= p.endTime) {
            currentPhase = 0;
        } else if (block.timestamp <= p.revealEndTime) {
            currentPhase = 1;
        } else {
            currentPhase = 2;
        }

        return (
            p.id,
            p.title,
            p.description,
            p.proposer,
            p.creditRoot,
            p.endTime,
            p.revealEndTime,
            p.forVotes,
            p.againstVotes,
            p.abstainVotes,
            p.totalCreditsSpent,
            p.totalCommitments,
            p.revealedVotes,
            currentPhase
        );
    }

    /**
     * @dev Get commitment details
     */
    function getCommitment(uint256 _proposalId, uint256 _nullifier)
        external
        view
        returns (
            uint256 commitment,
            uint256 creditsSpent,
            uint256 numVotes,
            bool revealed,
            uint256 revealedChoice
        )
    {
        VoteCommitment storage vc = commitments[_proposalId][_nullifier];
        return (vc.commitment, vc.creditsSpent, vc.numVotes, vc.revealed, vc.revealedChoice);
    }

    /**
     * @dev Get current phase
     */
    function getPhase(uint256 _proposalId) external view returns (uint8) {
        Proposal storage p = proposals[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        if (block.timestamp <= p.endTime) return 0;
        if (block.timestamp <= p.revealEndTime) return 1;
        return 2;
    }

    /**
     * @dev Check if credit root is valid
     */
    function isCreditRootValid(uint256 _creditRoot) external view returns (bool) {
        return validCreditRoots[_creditRoot];
    }
}
