// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/PrivateVoting.sol";

contract PrivateVotingTest is Test {
    PrivateVoting public voting;
    address public alice = address(0x1);
    address public bob = address(0x2);

    function setUp() public {
        voting = new PrivateVoting();
    }

    // ============ Proposal Creation Tests ============

    function test_CreateProposal() public {
        uint256 proposalId = voting.createProposal("Test Proposal", "Description", 7 days);
        assertEq(proposalId, 1);
        assertEq(voting.proposalCount(), 1);
    }

    function test_CreateMultipleProposals() public {
        voting.createProposal("Proposal 1", "Desc 1", 7 days);
        voting.createProposal("Proposal 2", "Desc 2", 7 days);
        voting.createProposal("Proposal 3", "Desc 3", 7 days);
        assertEq(voting.proposalCount(), 3);
    }

    function test_GetProposal() public {
        voting.createProposal("Test Title", "Test Description", 7 days);

        (
            uint256 id,
            string memory title,
            string memory description,
            address proposer,
            ,
            ,
            uint256 totalVoters,
            bool isActive
        ) = voting.getProposal(1);

        assertEq(id, 1);
        assertEq(title, "Test Title");
        assertEq(description, "Test Description");
        assertEq(proposer, address(this));
        assertEq(totalVoters, 0);
        assertTrue(isActive);
    }

    // ============ Vote Commitment Tests ============

    function test_SubmitVoteCommitment() public {
        voting.createProposal("Test", "Desc", 7 days);

        bytes32 commitment = keccak256(abi.encodePacked(uint8(1), bytes32("salt")));

        vm.prank(alice);
        voting.submitVoteCommitment(1, commitment, 100);

        assertTrue(voting.hasVoted(1, alice));
    }

    function test_GetVoteCommitment() public {
        voting.createProposal("Test", "Desc", 7 days);

        bytes32 commitment = keccak256(abi.encodePacked(uint8(1), bytes32("salt")));

        vm.prank(alice);
        voting.submitVoteCommitment(1, commitment, 100);

        (bytes32 storedCommitment, uint256 votingPower, , bool hasVoted) = voting.getVoteCommitment(1, alice);

        assertEq(storedCommitment, commitment);
        assertEq(votingPower, 100);
        assertTrue(hasVoted);
    }

    function test_MultipleVoters() public {
        voting.createProposal("Test", "Desc", 7 days);

        vm.prank(alice);
        voting.submitVoteCommitment(1, keccak256("alice"), 100);

        vm.prank(bob);
        voting.submitVoteCommitment(1, keccak256("bob"), 200);

        assertTrue(voting.hasVoted(1, alice));
        assertTrue(voting.hasVoted(1, bob));

        (, , , , , , uint256 totalVoters, ) = voting.getProposal(1);
        assertEq(totalVoters, 2);
    }

    // ============ Error Tests ============

    function test_RevertWhen_ProposalNotFound() public {
        bytes32 commitment = keccak256("test");

        vm.expectRevert(PrivateVoting.ProposalNotFound.selector);
        voting.submitVoteCommitment(999, commitment, 100);
    }

    function test_RevertWhen_AlreadyVoted() public {
        voting.createProposal("Test", "Desc", 7 days);

        vm.startPrank(alice);
        voting.submitVoteCommitment(1, keccak256("first"), 100);

        vm.expectRevert(PrivateVoting.AlreadyVoted.selector);
        voting.submitVoteCommitment(1, keccak256("second"), 100);
        vm.stopPrank();
    }

    function test_RevertWhen_ProposalExpired() public {
        voting.createProposal("Test", "Desc", 1 days);

        // Fast forward 2 days
        vm.warp(block.timestamp + 2 days);

        vm.expectRevert(PrivateVoting.ProposalNotActive.selector);
        vm.prank(alice);
        voting.submitVoteCommitment(1, keccak256("test"), 100);
    }

    function test_RevertWhen_ZeroVotingPower() public {
        voting.createProposal("Test", "Desc", 7 days);

        vm.expectRevert(PrivateVoting.InvalidVotingPower.selector);
        vm.prank(alice);
        voting.submitVoteCommitment(1, keccak256("test"), 0);
    }

    // ============ Edge Case Tests ============

    function test_VoteJustBeforeExpiry() public {
        voting.createProposal("Test", "Desc", 1 days);

        // Fast forward to just before expiry
        vm.warp(block.timestamp + 1 days - 1);

        vm.prank(alice);
        voting.submitVoteCommitment(1, keccak256("test"), 100);

        assertTrue(voting.hasVoted(1, alice));
    }

    function test_GetProposalVoters() public {
        voting.createProposal("Test", "Desc", 7 days);

        vm.prank(alice);
        voting.submitVoteCommitment(1, keccak256("alice"), 100);

        vm.prank(bob);
        voting.submitVoteCommitment(1, keccak256("bob"), 200);

        address[] memory voters = voting.getProposalVoters(1);
        assertEq(voters.length, 2);
        assertEq(voters[0], alice);
        assertEq(voters[1], bob);
    }
}
