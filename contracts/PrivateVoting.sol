// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PrivateVoting
 * @dev ZK Private Voting Demo Contract for zkDEX D1
 * @notice This contract implements commit-reveal voting with on-chain commitment recording
 */
contract PrivateVoting {
    // Proposal structure
    struct Proposal {
        uint256 id;
        string title;
        string description;
        address proposer;
        uint256 startTime;
        uint256 endTime;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalVoters;
        bool exists;
    }

    // Vote commitment structure
    struct VoteCommitment {
        bytes32 commitment;
        uint256 votingPower;
        uint256 timestamp;
        bool exists;
    }

    // State variables
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => VoteCommitment)) public voteCommitments;
    mapping(uint256 => address[]) public proposalVoters;

    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        string title,
        address indexed proposer,
        uint256 startTime,
        uint256 endTime
    );

    event VoteCommitted(
        uint256 indexed proposalId,
        address indexed voter,
        bytes32 commitment,
        uint256 votingPower,
        uint256 timestamp
    );

    // Errors
    error ProposalNotFound();
    error ProposalNotActive();
    error AlreadyVoted();
    error InvalidVotingPower();

    /**
     * @dev Create a new proposal
     * @param _title Proposal title
     * @param _description Proposal description
     * @param _duration Voting duration in seconds
     */
    function createProposal(
        string calldata _title,
        string calldata _description,
        uint256 _duration
    ) external returns (uint256) {
        proposalCount++;
        uint256 proposalId = proposalCount;

        proposals[proposalId] = Proposal({
            id: proposalId,
            title: _title,
            description: _description,
            proposer: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            totalVoters: 0,
            exists: true
        });

        emit ProposalCreated(
            proposalId,
            _title,
            msg.sender,
            block.timestamp,
            block.timestamp + _duration
        );

        return proposalId;
    }

    /**
     * @dev Submit a vote commitment
     * @param _proposalId Proposal ID to vote on
     * @param _commitment Hash of (choice + salt) - the encrypted vote
     * @param _votingPower Voter's voting power (token amount)
     */
    function submitVoteCommitment(
        uint256 _proposalId,
        bytes32 _commitment,
        uint256 _votingPower
    ) external {
        Proposal storage proposal = proposals[_proposalId];

        if (!proposal.exists) revert ProposalNotFound();
        if (block.timestamp > proposal.endTime) revert ProposalNotActive();
        if (voteCommitments[_proposalId][msg.sender].exists) revert AlreadyVoted();
        if (_votingPower == 0) revert InvalidVotingPower();

        // Record the commitment
        voteCommitments[_proposalId][msg.sender] = VoteCommitment({
            commitment: _commitment,
            votingPower: _votingPower,
            timestamp: block.timestamp,
            exists: true
        });

        // Add voter to list
        proposalVoters[_proposalId].push(msg.sender);
        proposal.totalVoters++;

        emit VoteCommitted(
            _proposalId,
            msg.sender,
            _commitment,
            _votingPower,
            block.timestamp
        );
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 _proposalId) external view returns (
        uint256 id,
        string memory title,
        string memory description,
        address proposer,
        uint256 startTime,
        uint256 endTime,
        uint256 totalVoters,
        bool isActive
    ) {
        Proposal storage proposal = proposals[_proposalId];
        if (!proposal.exists) revert ProposalNotFound();

        return (
            proposal.id,
            proposal.title,
            proposal.description,
            proposal.proposer,
            proposal.startTime,
            proposal.endTime,
            proposal.totalVoters,
            block.timestamp <= proposal.endTime
        );
    }

    /**
     * @dev Get vote commitment for a voter
     */
    function getVoteCommitment(uint256 _proposalId, address _voter) external view returns (
        bytes32 commitment,
        uint256 votingPower,
        uint256 timestamp,
        bool hasVoted
    ) {
        VoteCommitment storage vc = voteCommitments[_proposalId][_voter];
        return (vc.commitment, vc.votingPower, vc.timestamp, vc.exists);
    }

    /**
     * @dev Get all voters for a proposal
     */
    function getProposalVoters(uint256 _proposalId) external view returns (address[] memory) {
        return proposalVoters[_proposalId];
    }

    /**
     * @dev Check if address has voted on proposal
     */
    function hasVoted(uint256 _proposalId, address _voter) external view returns (bool) {
        return voteCommitments[_proposalId][_voter].exists;
    }
}
