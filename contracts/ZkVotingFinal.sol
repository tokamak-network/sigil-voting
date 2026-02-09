// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PoseidonT5.sol";

/**
 * @title ZkVotingFinal
 * @dev Unified ZK voting contract supporting both D1 (Private Voting) and D2 (Quadratic Voting)
 *
 * D1: Standard commit-reveal voting with 1:1 voting power
 * D2: Quadratic voting where cost = numVotes^2 (anti-whale mechanism)
 *
 * Both systems share:
 * - ZK proof verification
 * - Commit-reveal mechanism
 * - Nullifier-based double-vote prevention
 * - Merkle tree voter/credit snapshots
 */

interface IVerifierD1 {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[5] calldata _pubSignals
    ) external view returns (bool);
}

interface IVerifierD2 {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[5] calldata _pubSignals
    ) external view returns (bool);
}

contract ZkVotingFinal {
    // ============ Constants ============
    uint256 public constant CHOICE_AGAINST = 0;
    uint256 public constant CHOICE_FOR = 1;
    uint256 public constant CHOICE_ABSTAIN = 2;
    uint256 public constant INITIAL_CREDITS = 10000;

    // ============ Verifiers ============
    IVerifierD1 public immutable verifierD1;
    IVerifierD2 public immutable verifierD2;

    // ============ Counters ============
    uint256 public proposalCountD1;
    uint256 public proposalCountD2;

    // ============ D1 Structs ============
    struct ProposalD1 {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;
        uint256 revealEndTime;
        uint256 merkleRoot;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalCommitments;
        uint256 revealedVotes;
        bool exists;
    }

    struct VoteCommitmentD1 {
        uint256 commitment;
        uint256 votingPower;
        uint256 nullifier;
        uint256 timestamp;
        bool revealed;
        uint256 revealedChoice;
        bool exists;
    }

    // ============ D2 Structs ============
    struct ProposalD2 {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;
        uint256 revealEndTime;
        uint256 creditRoot;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalCreditsSpent;
        uint256 totalCommitments;
        uint256 revealedVotes;
        bool exists;
    }

    struct VoteCommitmentD2 {
        uint256 commitment;
        uint256 creditsSpent;
        uint256 numVotes;
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

    // ============ D1 Storage ============
    mapping(uint256 => ProposalD1) public proposalsD1;
    mapping(uint256 => mapping(uint256 => VoteCommitmentD1)) public commitmentsD1;
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsedD1;
    mapping(uint256 => bool) public validMerkleRoots;
    uint256[] public merkleRootHistory;
    uint256[] public registeredVoters;
    mapping(uint256 => bool) public isVoterRegistered;
    mapping(uint256 => uint256[]) public proposalVoterSnapshots;

    // ============ D2 Storage ============
    mapping(uint256 => ProposalD2) public proposalsD2;
    mapping(uint256 => mapping(uint256 => VoteCommitmentD2)) public commitmentsD2;
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsedD2;
    mapping(uint256 => bool) public validCreditRoots;
    uint256[] public creditRootHistory;
    uint256[] public registeredCreditNotes;
    mapping(uint256 => bool) public isCreditNoteRegistered;
    mapping(address => UserCredits) public userCredits;

    // ============ Events ============
    // D1 Events
    event ProposalCreatedD1(uint256 indexed proposalId, string title, address indexed proposer, uint256 merkleRoot, uint256 endTime, uint256 revealEndTime);
    event MerkleRootRegistered(uint256 indexed merkleRoot, uint256 timestamp);
    event VoterRegistered(uint256 indexed noteHash, uint256 timestamp);
    event VoteCommittedD1(uint256 indexed proposalId, uint256 indexed nullifier, uint256 commitment, uint256 votingPower);
    event VoteRevealedD1(uint256 indexed proposalId, uint256 indexed nullifier, uint256 choice, uint256 votingPower);

    // D2 Events
    event ProposalCreatedD2(uint256 indexed proposalId, string title, address indexed proposer, uint256 creditRoot, uint256 endTime, uint256 revealEndTime);
    event CreditRootRegistered(uint256 indexed creditRoot, uint256 timestamp);
    event CreditNoteRegistered(uint256 indexed creditNoteHash, uint256 timestamp);
    event CreditsInitialized(address indexed user, uint256 credits);
    event CreditsBurned(address indexed user, uint256 amount, uint256 remaining);
    event CreditsMinted(address indexed user, uint256 amount, uint256 total);
    event VoteCommittedD2(uint256 indexed proposalId, uint256 indexed nullifier, uint256 commitment, uint256 numVotes, uint256 creditsSpent);
    event VoteRevealedD2(uint256 indexed proposalId, uint256 indexed nullifier, uint256 choice, uint256 numVotes, uint256 creditsSpent);

    // ============ Errors ============
    error ProposalNotFound();
    error NotInCommitPhase();
    error NotInRevealPhase();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error InvalidMerkleRoot();
    error InvalidCreditRoot();
    error InvalidChoice();
    error AlreadyRevealed();
    error CommitmentNotFound();
    error InvalidReveal();
    error ZeroVotingPower();
    error InsufficientCredits();
    error InvalidQuadraticCost();

    // ============ Constructor ============
    constructor(address _verifierD1, address _verifierD2) {
        verifierD1 = IVerifierD1(_verifierD1);
        verifierD2 = IVerifierD2(_verifierD2);
    }

    // ============================================================
    //                    SHARED FUNCTIONS
    // ============================================================

    /**
     * @dev Mint test tokens for demo purposes (anyone can call)
     * @param amount Amount of credits to mint
     */
    function mintTestTokens(uint256 amount) external {
        UserCredits storage uc = userCredits[msg.sender];
        if (!uc.initialized) {
            uc.totalCredits = amount;
            uc.usedCredits = 0;
            uc.initialized = true;
        } else {
            uc.totalCredits += amount;
        }
        emit CreditsMinted(msg.sender, amount, uc.totalCredits);
    }

    /**
     * @dev Initialize user with default credits
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
     * @dev Get available credits for a user
     */
    function getAvailableCredits(address user) external view returns (uint256) {
        UserCredits storage uc = userCredits[user];
        if (!uc.initialized) return INITIAL_CREDITS;
        return uc.totalCredits - uc.usedCredits;
    }

    /**
     * @dev Calculate quadratic cost
     */
    function calculateQuadraticCost(uint256 numVotes) public pure returns (uint256) {
        return numVotes * numVotes;
    }

    // ============================================================
    //                    D1 FUNCTIONS (Private Voting)
    // ============================================================

    function registerMerkleRoot(uint256 _merkleRoot) external {
        validMerkleRoots[_merkleRoot] = true;
        merkleRootHistory.push(_merkleRoot);
        emit MerkleRootRegistered(_merkleRoot, block.timestamp);
    }

    function registerVoter(uint256 _noteHash) external {
        if (isVoterRegistered[_noteHash]) return;
        isVoterRegistered[_noteHash] = true;
        registeredVoters.push(_noteHash);
        emit VoterRegistered(_noteHash, block.timestamp);
    }

    function getRegisteredVoters() external view returns (uint256[] memory) {
        return registeredVoters;
    }

    function getVoterCount() external view returns (uint256) {
        return registeredVoters.length;
    }

    function updateProposalVoters(uint256 _proposalId, uint256 _newMerkleRoot) external {
        ProposalD1 storage proposal = proposalsD1[_proposalId];
        if (!proposal.exists) revert ProposalNotFound();

        proposal.merkleRoot = _newMerkleRoot;
        delete proposalVoterSnapshots[_proposalId];
        for (uint256 i = 0; i < registeredVoters.length; i++) {
            proposalVoterSnapshots[_proposalId].push(registeredVoters[i]);
        }

        if (!validMerkleRoots[_newMerkleRoot]) {
            validMerkleRoots[_newMerkleRoot] = true;
            merkleRootHistory.push(_newMerkleRoot);
        }
    }

    function createProposalD1(
        string calldata _title,
        string calldata _description,
        uint256 _merkleRoot,
        uint256 _votingDuration,
        uint256 _revealDuration
    ) external returns (uint256) {
        if (!validMerkleRoots[_merkleRoot]) revert InvalidMerkleRoot();

        proposalCountD1++;
        uint256 proposalId = proposalCountD1;

        proposalsD1[proposalId] = ProposalD1({
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

        for (uint256 i = 0; i < registeredVoters.length; i++) {
            proposalVoterSnapshots[proposalId].push(registeredVoters[i]);
        }

        emit ProposalCreatedD1(proposalId, _title, msg.sender, _merkleRoot, block.timestamp + _votingDuration, block.timestamp + _votingDuration + _revealDuration);
        return proposalId;
    }

    /**
     * @dev D1 Commit Vote (1:1 voting power)
     */
    function castVoteD1(
        uint256 _proposalId,
        uint256 _commitment,
        uint256 _votingPower,
        uint256 _nullifier,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external {
        ProposalD1 storage proposal = proposalsD1[_proposalId];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp > proposal.endTime) revert NotInCommitPhase();
        if (nullifierUsedD1[_proposalId][_nullifier]) revert NullifierAlreadyUsed();
        if (_votingPower == 0) revert ZeroVotingPower();

        uint256[5] memory pubSignals = [_nullifier, _commitment, _proposalId, _votingPower, proposal.merkleRoot];
        bool validProof = verifierD1.verifyProof(_pA, _pB, _pC, pubSignals);
        if (!validProof) revert InvalidProof();

        nullifierUsedD1[_proposalId][_nullifier] = true;
        commitmentsD1[_proposalId][_nullifier] = VoteCommitmentD1({
            commitment: _commitment,
            votingPower: _votingPower,
            nullifier: _nullifier,
            timestamp: block.timestamp,
            revealed: false,
            revealedChoice: 0,
            exists: true
        });

        proposal.totalCommitments++;
        emit VoteCommittedD1(_proposalId, _nullifier, _commitment, _votingPower);
    }

    function revealVoteD1(uint256 _proposalId, uint256 _nullifier, uint256 _choice, uint256 _voteSalt) external {
        ProposalD1 storage proposal = proposalsD1[_proposalId];
        VoteCommitmentD1 storage vc = commitmentsD1[_proposalId][_nullifier];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp <= proposal.endTime) revert NotInRevealPhase();
        if (block.timestamp > proposal.revealEndTime) revert NotInRevealPhase();
        if (!vc.exists) revert CommitmentNotFound();
        if (vc.revealed) revert AlreadyRevealed();
        if (_choice > CHOICE_ABSTAIN) revert InvalidChoice();

        uint256 computedCommitment = PoseidonT5.hash([_choice, vc.votingPower, _proposalId, _voteSalt]);
        if (computedCommitment != vc.commitment) revert InvalidReveal();

        vc.revealed = true;
        vc.revealedChoice = _choice;

        if (_choice == CHOICE_FOR) {
            proposal.forVotes += vc.votingPower;
        } else if (_choice == CHOICE_AGAINST) {
            proposal.againstVotes += vc.votingPower;
        } else {
            proposal.abstainVotes += vc.votingPower;
        }
        proposal.revealedVotes++;

        emit VoteRevealedD1(_proposalId, _nullifier, _choice, vc.votingPower);
    }

    function getProposalD1(uint256 _proposalId)
        external
        view
        returns (
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
            uint8 phase
        )
    {
        ProposalD1 storage p = proposalsD1[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        uint8 currentPhase;
        if (block.timestamp <= p.endTime) currentPhase = 0;
        else if (block.timestamp <= p.revealEndTime) currentPhase = 1;
        else currentPhase = 2;

        return (p.id, p.title, p.description, p.proposer, p.merkleRoot, p.endTime, p.revealEndTime, p.forVotes, p.againstVotes, p.abstainVotes, p.totalCommitments, p.revealedVotes, currentPhase);
    }

    // ============================================================
    //                    D2 FUNCTIONS (Quadratic Voting)
    // ============================================================

    function registerCreditRoot(uint256 _creditRoot) external {
        validCreditRoots[_creditRoot] = true;
        creditRootHistory.push(_creditRoot);
        emit CreditRootRegistered(_creditRoot, block.timestamp);
    }

    function registerCreditNote(uint256 _creditNoteHash) external {
        if (isCreditNoteRegistered[_creditNoteHash]) return;
        isCreditNoteRegistered[_creditNoteHash] = true;
        registeredCreditNotes.push(_creditNoteHash);
        emit CreditNoteRegistered(_creditNoteHash, block.timestamp);
    }

    function getRegisteredCreditNotes() external view returns (uint256[] memory) {
        return registeredCreditNotes;
    }

    function createProposalD2(
        string calldata _title,
        string calldata _description,
        uint256 _creditRoot,
        uint256 _votingDuration,
        uint256 _revealDuration
    ) external returns (uint256) {
        if (!validCreditRoots[_creditRoot]) revert InvalidCreditRoot();

        proposalCountD2++;
        uint256 proposalId = proposalCountD2;

        proposalsD2[proposalId] = ProposalD2({
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

        emit ProposalCreatedD2(proposalId, _title, msg.sender, _creditRoot, block.timestamp + _votingDuration, block.timestamp + _votingDuration + _revealDuration);
        return proposalId;
    }

    /**
     * @dev D2 Quadratic Vote - Cost = numVotes^2 (BURNS credits)
     */
    function castVoteD2(
        uint256 _proposalId,
        uint256 _commitment,
        uint256 _numVotes,
        uint256 _creditsSpent,
        uint256 _nullifier,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC
    ) external {
        ProposalD2 storage proposal = proposalsD2[_proposalId];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp > proposal.endTime) revert NotInCommitPhase();
        if (nullifierUsedD2[_proposalId][_nullifier]) revert NullifierAlreadyUsed();

        // CRITICAL: Verify quadratic cost
        uint256 expectedCost = calculateQuadraticCost(_numVotes);
        if (_creditsSpent != expectedCost) revert InvalidQuadraticCost();

        // Verify ZK proof
        uint256[5] memory pubSignals = [_nullifier, _commitment, _proposalId, _creditsSpent, proposal.creditRoot];
        bool validProof = verifierD2.verifyProof(_pA, _pB, _pC, pubSignals);
        if (!validProof) revert InvalidProof();

        // Initialize credits if needed
        if (!userCredits[msg.sender].initialized) {
            userCredits[msg.sender] = UserCredits({
                totalCredits: INITIAL_CREDITS,
                usedCredits: 0,
                initialized: true
            });
        }

        // BURN credits (quadratic cost)
        UserCredits storage uc = userCredits[msg.sender];
        uint256 available = uc.totalCredits - uc.usedCredits;
        if (_creditsSpent > available) revert InsufficientCredits();

        uc.usedCredits += _creditsSpent;
        emit CreditsBurned(msg.sender, _creditsSpent, uc.totalCredits - uc.usedCredits);

        // Store commitment
        nullifierUsedD2[_proposalId][_nullifier] = true;
        commitmentsD2[_proposalId][_nullifier] = VoteCommitmentD2({
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

        emit VoteCommittedD2(_proposalId, _nullifier, _commitment, _numVotes, _creditsSpent);
    }

    function revealVoteD2(
        uint256 _proposalId,
        uint256 _nullifier,
        uint256 _choice,
        uint256 _numVotes,
        uint256 _voteSalt
    ) external {
        ProposalD2 storage proposal = proposalsD2[_proposalId];
        VoteCommitmentD2 storage vc = commitmentsD2[_proposalId][_nullifier];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp <= proposal.endTime) revert NotInRevealPhase();
        if (block.timestamp > proposal.revealEndTime) revert NotInRevealPhase();
        if (!vc.exists) revert CommitmentNotFound();
        if (vc.revealed) revert AlreadyRevealed();
        if (_choice > CHOICE_ABSTAIN) revert InvalidChoice();

        // Verify reveal: commitment = hash(choice, numVotes, creditsSpent, proposalId, voteSalt)
        uint256[5] memory inputs = [_choice, _numVotes, vc.creditsSpent, _proposalId, _voteSalt];
        uint256 computedCommitment = PoseidonT5.hash(inputs);
        if (computedCommitment != vc.commitment) revert InvalidReveal();

        vc.revealed = true;
        vc.revealedChoice = _choice;

        // Tally votes (numVotes, not creditsSpent)
        if (_choice == CHOICE_FOR) {
            proposal.forVotes += _numVotes;
        } else if (_choice == CHOICE_AGAINST) {
            proposal.againstVotes += _numVotes;
        } else {
            proposal.abstainVotes += _numVotes;
        }
        proposal.revealedVotes++;

        emit VoteRevealedD2(_proposalId, _nullifier, _choice, _numVotes, vc.creditsSpent);
    }

    function getProposalD2(uint256 _proposalId)
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
        ProposalD2 storage p = proposalsD2[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        uint8 currentPhase;
        if (block.timestamp <= p.endTime) currentPhase = 0;
        else if (block.timestamp <= p.revealEndTime) currentPhase = 1;
        else currentPhase = 2;

        return (p.id, p.title, p.description, p.proposer, p.creditRoot, p.endTime, p.revealEndTime, p.forVotes, p.againstVotes, p.abstainVotes, p.totalCreditsSpent, p.totalCommitments, p.revealedVotes, currentPhase);
    }

    function getPhaseD2(uint256 _proposalId) external view returns (uint8) {
        ProposalD2 storage p = proposalsD2[_proposalId];
        if (!p.exists) revert ProposalNotFound();
        if (block.timestamp <= p.endTime) return 0;
        if (block.timestamp <= p.revealEndTime) return 1;
        return 2;
    }

    function isCreditRootValid(uint256 _creditRoot) external view returns (bool) {
        return validCreditRoots[_creditRoot];
    }

    function isMerkleRootValid(uint256 _merkleRoot) external view returns (bool) {
        return validMerkleRoots[_merkleRoot];
    }
}
