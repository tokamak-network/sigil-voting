// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/PrivateVoting.sol";

contract PrivateVotingTest is Test {
    PrivateVoting public voting;
    address public alice = address(0x1);
    address public bob = address(0x2);

    uint256 constant VOTING_DURATION = 1 days;
    uint256 constant REVEAL_DURATION = 1 days;

    function setUp() public {
        voting = new PrivateVoting();
    }

    // ============ Proposal Tests ============

    function test_CreateProposal() public {
        uint256 proposalId = voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);
        assertEq(proposalId, 1);
        assertEq(voting.proposalCount(), 1);
    }

    function test_GetProposal() public {
        voting.createProposal("Test Title", "Test Description", VOTING_DURATION, REVEAL_DURATION);

        (
            uint256 id,
            string memory title,
            ,
            address proposer,
            ,
            ,
            ,
            ,
            ,
            uint256 totalVoters,
            ,
            uint8 phase
        ) = voting.getProposal(1);

        assertEq(id, 1);
        assertEq(title, "Test Title");
        assertEq(proposer, address(this));
        assertEq(totalVoters, 0);
        assertEq(phase, 0); // Voting phase
    }

    // ============ Commit Tests ============

    function test_CommitVote() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        bytes32 salt = bytes32("random_salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint8(1), salt));

        vm.prank(alice);
        voting.commitVote(1, commitment, 100);

        assertTrue(voting.hasVoted(1, alice));
        assertFalse(voting.hasRevealed(1, alice));
    }

    function test_RevertWhen_AlreadyVoted() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        vm.startPrank(alice);
        voting.commitVote(1, keccak256("first"), 100);

        vm.expectRevert(PrivateVoting.AlreadyVoted.selector);
        voting.commitVote(1, keccak256("second"), 100);
        vm.stopPrank();
    }

    // ============ Reveal Tests ============

    function test_RevealVote() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        bytes32 salt = bytes32("random_salt");
        uint8 choice = 1; // For
        bytes32 commitment = keccak256(abi.encodePacked(choice, salt));

        // Commit
        vm.prank(alice);
        voting.commitVote(1, commitment, 100);

        // Fast forward to reveal phase
        vm.warp(block.timestamp + VOTING_DURATION + 1);

        // Reveal
        vm.prank(alice);
        voting.revealVote(1, choice, salt);

        assertTrue(voting.hasRevealed(1, alice));

        // Check tally
        (, , , , , , uint256 forVotes, , , , uint256 revealedVoters, ) = voting.getProposal(1);
        assertEq(forVotes, 100);
        assertEq(revealedVoters, 1);
    }

    function test_RevealMultipleVotes() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        bytes32 saltAlice = bytes32("salt_alice");
        bytes32 saltBob = bytes32("salt_bob");

        // Alice votes For
        vm.prank(alice);
        voting.commitVote(1, keccak256(abi.encodePacked(uint8(1), saltAlice)), 100);

        // Bob votes Against
        vm.prank(bob);
        voting.commitVote(1, keccak256(abi.encodePacked(uint8(2), saltBob)), 200);

        // Fast forward to reveal phase
        vm.warp(block.timestamp + VOTING_DURATION + 1);

        // Reveal
        vm.prank(alice);
        voting.revealVote(1, 1, saltAlice);

        vm.prank(bob);
        voting.revealVote(1, 2, saltBob);

        // Check tally
        (, , , , , , uint256 forVotes, uint256 againstVotes, , , uint256 revealedVoters, ) = voting.getProposal(1);
        assertEq(forVotes, 100);
        assertEq(againstVotes, 200);
        assertEq(revealedVoters, 2);
    }

    function test_RevertWhen_RevealBeforeVotingEnds() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint8(1), salt));

        vm.prank(alice);
        voting.commitVote(1, commitment, 100);

        // Try to reveal during voting phase
        vm.expectRevert(PrivateVoting.NotInRevealPhase.selector);
        vm.prank(alice);
        voting.revealVote(1, 1, salt);
    }

    function test_RevertWhen_RevealAfterRevealEnds() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint8(1), salt));

        vm.prank(alice);
        voting.commitVote(1, commitment, 100);

        // Fast forward past reveal phase
        vm.warp(block.timestamp + VOTING_DURATION + REVEAL_DURATION + 1);

        vm.expectRevert(PrivateVoting.NotInRevealPhase.selector);
        vm.prank(alice);
        voting.revealVote(1, 1, salt);
    }

    function test_RevertWhen_InvalidReveal() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint8(1), salt));

        vm.prank(alice);
        voting.commitVote(1, commitment, 100);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        // Try to reveal with wrong choice
        vm.expectRevert(PrivateVoting.InvalidReveal.selector);
        vm.prank(alice);
        voting.revealVote(1, 2, salt); // Wrong choice
    }

    function test_RevertWhen_AlreadyRevealed() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint8(1), salt));

        vm.prank(alice);
        voting.commitVote(1, commitment, 100);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        vm.startPrank(alice);
        voting.revealVote(1, 1, salt);

        vm.expectRevert(PrivateVoting.AlreadyRevealed.selector);
        voting.revealVote(1, 1, salt);
        vm.stopPrank();
    }

    // ============ Phase Tests ============

    function test_PhaseTransitions() public {
        voting.createProposal("Test", "Desc", VOTING_DURATION, REVEAL_DURATION);

        // Phase 0: Voting
        (, , , , , , , , , , , uint8 phase) = voting.getProposal(1);
        assertEq(phase, 0);

        // Phase 1: Reveal
        vm.warp(block.timestamp + VOTING_DURATION + 1);
        (, , , , , , , , , , , phase) = voting.getProposal(1);
        assertEq(phase, 1);

        // Phase 2: Ended
        vm.warp(block.timestamp + REVEAL_DURATION + 1);
        (, , , , , , , , , , , phase) = voting.getProposal(1);
        assertEq(phase, 2);
    }
}
