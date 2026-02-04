// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PrivateVoting
 * @dev ZK Private Voting with Commit-Reveal mechanism
 */
contract PrivateVoting {
    struct Proposal {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;
        uint256 revealEndTime;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalVoters;
        uint256 revealedVoters;
        bool exists;
    }

    struct VoteCommitment {
        bytes32 commitment;
        uint256 votingPower;
        uint256 timestamp;
        bool revealed;
        uint8 revealedChoice; // 1=for, 2=against, 3=abstain
        bool exists;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => VoteCommitment)) public voteCommitments;
    mapping(uint256 => address[]) public proposalVoters;

    event ProposalCreated(
        uint256 indexed proposalId,
        string title,
        address indexed proposer,
        uint256 endTime,
        uint256 revealEndTime
    );

    event VoteCommitted(
        uint256 indexed proposalId,
        address indexed voter,
        bytes32 commitment,
        uint256 votingPower
    );

    event VoteRevealed(
        uint256 indexed proposalId,
        address indexed voter,
        uint8 choice,
        uint256 votingPower
    );

    error ProposalNotFound();
    error ProposalNotActive();
    error NotInRevealPhase();
    error AlreadyVoted();
    error AlreadyRevealed();
    error NotVoted();
    error InvalidReveal();
    error InvalidVotingPower();
    error InvalidChoice();

    /**
     * @dev Create a new proposal
     * @param _title Proposal title
     * @param _description Proposal description
     * @param _votingDuration Voting duration in seconds
     * @param _revealDuration Reveal duration in seconds (after voting ends)
     */
    function createProposal(
        string calldata _title,
        string calldata _description,
        uint256 _votingDuration,
        uint256 _revealDuration
    ) external returns (uint256) {
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
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            totalVoters: 0,
            revealedVoters: 0,
            exists: true
        });

        emit ProposalCreated(
            proposalId,
            _title,
            msg.sender,
            block.timestamp + _votingDuration,
            block.timestamp + _votingDuration + _revealDuration
        );

        return proposalId;
    }

    /**
     * @dev Submit a vote commitment (Phase 1: Commit)
     * @param _proposalId Proposal ID
     * @param _commitment keccak256(abi.encodePacked(choice, salt))
     * @param _votingPower Voter's voting power
     */
    function commitVote(
        uint256 _proposalId,
        bytes32 _commitment,
        uint256 _votingPower
    ) external {
        Proposal storage proposal = proposals[_proposalId];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp > proposal.endTime) revert ProposalNotActive();
        if (voteCommitments[_proposalId][msg.sender].exists) revert AlreadyVoted();
        if (_votingPower == 0) revert InvalidVotingPower();

        voteCommitments[_proposalId][msg.sender] = VoteCommitment({
            commitment: _commitment,
            votingPower: _votingPower,
            timestamp: block.timestamp,
            revealed: false,
            revealedChoice: 0,
            exists: true
        });

        proposalVoters[_proposalId].push(msg.sender);
        proposal.totalVoters++;

        emit VoteCommitted(_proposalId, msg.sender, _commitment, _votingPower);
    }

    /**
     * @dev Reveal a vote (Phase 2: Reveal)
     * @param _proposalId Proposal ID
     * @param _choice Vote choice (1=for, 2=against, 3=abstain)
     * @param _salt Random salt used in commitment
     */
    function revealVote(
        uint256 _proposalId,
        uint8 _choice,
        bytes32 _salt
    ) external {
        Proposal storage proposal = proposals[_proposalId];
        VoteCommitment storage vc = voteCommitments[_proposalId][msg.sender];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp <= proposal.endTime) revert NotInRevealPhase();
        if (block.timestamp > proposal.revealEndTime) revert NotInRevealPhase();
        if (!vc.exists) revert NotVoted();
        if (vc.revealed) revert AlreadyRevealed();
        if (_choice < 1 || _choice > 3) revert InvalidChoice();

        // Verify commitment
        bytes32 computedHash = keccak256(abi.encodePacked(_choice, _salt));
        if (computedHash != vc.commitment) revert InvalidReveal();

        // Update vote
        vc.revealed = true;
        vc.revealedChoice = _choice;

        // Tally
        if (_choice == 1) {
            proposal.forVotes += vc.votingPower;
        } else if (_choice == 2) {
            proposal.againstVotes += vc.votingPower;
        } else {
            proposal.abstainVotes += vc.votingPower;
        }
        proposal.revealedVoters++;

        emit VoteRevealed(_proposalId, msg.sender, _choice, vc.votingPower);
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 _proposalId) external view returns (
        uint256 id,
        string memory title,
        string memory description,
        address proposer,
        uint256 endTime,
        uint256 revealEndTime,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        uint256 totalVoters,
        uint256 revealedVoters,
        uint8 phase // 0=voting, 1=reveal, 2=ended
    ) {
        Proposal storage p = proposals[_proposalId];
        if (!p.exists) revert ProposalNotFound();

        uint8 currentPhase;
        if (block.timestamp <= p.endTime) {
            currentPhase = 0; // Voting phase
        } else if (block.timestamp <= p.revealEndTime) {
            currentPhase = 1; // Reveal phase
        } else {
            currentPhase = 2; // Ended
        }

        return (
            p.id, p.title, p.description, p.proposer,
            p.endTime, p.revealEndTime,
            p.forVotes, p.againstVotes, p.abstainVotes,
            p.totalVoters, p.revealedVoters, currentPhase
        );
    }

    /**
     * @dev Get vote commitment details
     */
    function getVoteCommitment(uint256 _proposalId, address _voter) external view returns (
        bytes32 commitment,
        uint256 votingPower,
        bool revealed,
        uint8 revealedChoice
    ) {
        VoteCommitment storage vc = voteCommitments[_proposalId][_voter];
        return (vc.commitment, vc.votingPower, vc.revealed, vc.revealedChoice);
    }

    /**
     * @dev Check if user has voted
     */
    function hasVoted(uint256 _proposalId, address _voter) external view returns (bool) {
        return voteCommitments[_proposalId][_voter].exists;
    }

    /**
     * @dev Check if user has revealed
     */
    function hasRevealed(uint256 _proposalId, address _voter) external view returns (bool) {
        return voteCommitments[_proposalId][_voter].revealed;
    }

    /**
     * @dev Get all voters
     */
    function getProposalVoters(uint256 _proposalId) external view returns (address[] memory) {
        return proposalVoters[_proposalId];
    }
}
