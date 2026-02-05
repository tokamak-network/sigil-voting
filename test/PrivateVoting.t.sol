// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/PrivateVoting.sol";
import "../contracts/PoseidonT5.sol";

/**
 * @title MockVerifier
 * @dev Mock verifier for testing - always returns true
 * In production, this would be the actual Groth16 verifier
 */
contract MockVerifier is IVerifier {
    bool public shouldPass = true;

    function setVerificationResult(bool _shouldPass) external {
        shouldPass = _shouldPass;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[4] calldata
    ) external view override returns (bool) {
        return shouldPass;
    }
}

/**
 * @title PrivateVotingTest
 * @dev Test suite for D1 Private Voting specification
 *
 * D1 Spec: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md
 *
 * Tests cover:
 * - Merkle root registration
 * - Proposal creation with merkle root
 * - Commit phase with ZK proof verification
 * - Nullifier double-spend prevention
 * - Reveal phase with commitment verification
 * - Vote tallying
 * - Phase transitions
 */
contract PrivateVotingTest is Test {
    PrivateVoting public voting;
    MockVerifier public verifier;

    address public alice = address(0x1);
    address public bob = address(0x2);
    address public charlie = address(0x3);

    uint256 constant VOTING_DURATION = 1 days;
    uint256 constant REVEAL_DURATION = 1 days;
    uint256 constant MERKLE_ROOT = 12345678901234567890;

    // D1 Spec: commitment = hash(choice, votingPower, proposalId, voteSalt)
    // Using Poseidon hash (same as ZK circuit)
    function computeCommitment(
        uint256 choice,
        uint256 votingPower,
        uint256 proposalId,
        uint256 voteSalt
    ) internal pure returns (uint256) {
        return PoseidonT5.hash([choice, votingPower, proposalId, voteSalt]);
    }

    // Mock proof data
    uint256[2] pA = [uint256(1), uint256(2)];
    uint256[2][2] pB = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
    uint256[2] pC = [uint256(7), uint256(8)];

    function setUp() public {
        verifier = new MockVerifier();
        voting = new PrivateVoting(address(verifier));
    }

    // ============ Merkle Root Tests ============

    function test_RegisterMerkleRoot() public {
        voting.registerMerkleRoot(MERKLE_ROOT);

        assertTrue(voting.isMerkleRootValid(MERKLE_ROOT));

        uint256[] memory roots = voting.getMerkleRoots();
        assertEq(roots.length, 1);
        assertEq(roots[0], MERKLE_ROOT);
    }

    function test_RegisterMultipleMerkleRoots() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.registerMerkleRoot(MERKLE_ROOT + 1);

        assertTrue(voting.isMerkleRootValid(MERKLE_ROOT));
        assertTrue(voting.isMerkleRootValid(MERKLE_ROOT + 1));

        uint256[] memory roots = voting.getMerkleRoots();
        assertEq(roots.length, 2);
    }

    // ============ Proposal Tests ============

    function test_CreateProposal() public {
        voting.registerMerkleRoot(MERKLE_ROOT);

        uint256 proposalId = voting.createProposal(
            "Test Proposal",
            "Test Description",
            MERKLE_ROOT,
            VOTING_DURATION,
            REVEAL_DURATION
        );

        assertEq(proposalId, 1);
        assertEq(voting.proposalCount(), 1);
    }

    function test_CreateProposal_WithDetails() public {
        voting.registerMerkleRoot(MERKLE_ROOT);

        voting.createProposal(
            "Upgrade Protocol",
            "Proposal to upgrade the protocol to v2",
            MERKLE_ROOT,
            VOTING_DURATION,
            REVEAL_DURATION
        );

        (
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
        ) = voting.getProposal(1);

        assertEq(id, 1);
        assertEq(title, "Upgrade Protocol");
        assertEq(description, "Proposal to upgrade the protocol to v2");
        assertEq(proposer, address(this));
        assertEq(merkleRoot, MERKLE_ROOT);
        assertEq(forVotes, 0);
        assertEq(againstVotes, 0);
        assertEq(abstainVotes, 0);
        assertEq(totalCommitments, 0);
        assertEq(revealedVotes, 0);
        assertEq(phase, 0); // Commit phase
        assertTrue(endTime > block.timestamp);
        assertTrue(revealEndTime > endTime);
    }

    function test_RevertWhen_InvalidMerkleRoot() public {
        // Don't register merkle root
        vm.expectRevert(PrivateVoting.InvalidMerkleRoot.selector);
        voting.createProposal(
            "Test",
            "Desc",
            MERKLE_ROOT, // Not registered
            VOTING_DURATION,
            REVEAL_DURATION
        );
    }

    // ============ Commit Phase Tests ============

    function test_CommitVote() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 proposalId = 1;
        uint256 votingPower = 100;
        uint256 voteSalt = 999;
        uint256 nullifier = 12345;
        uint256 choice = voting.CHOICE_FOR();

        // D1 Spec: commitment = hash(choice, votingPower, proposalId, voteSalt)
        uint256 commitment = computeCommitment(choice, votingPower, proposalId, voteSalt);

        vm.prank(alice);
        voting.commitVote(proposalId, commitment, votingPower, nullifier, pA, pB, pC);

        // Verify commitment stored
        assertTrue(voting.isNullifierUsed(proposalId, nullifier));

        (uint256 storedCommitment, uint256 storedPower, bool revealed, ) = voting.getCommitment(proposalId, nullifier);
        assertEq(storedCommitment, commitment);
        assertEq(storedPower, votingPower);
        assertFalse(revealed);
    }

    function test_CommitVote_UpdatesTotalCommitments() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 commitment = computeCommitment(1, 100, 1, 999);

        vm.prank(alice);
        voting.commitVote(1, commitment, 100, 11111, pA, pB, pC);

        vm.prank(bob);
        voting.commitVote(1, commitment + 1, 200, 22222, pA, pB, pC);

        (,,,,,,,,,,uint256 totalCommitments,,) = voting.getProposal(1);
        assertEq(totalCommitments, 2);
    }

    function test_RevertWhen_NullifierAlreadyUsed() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 nullifier = 12345;
        uint256 commitment = computeCommitment(1, 100, 1, 999);

        vm.prank(alice);
        voting.commitVote(1, commitment, 100, nullifier, pA, pB, pC);

        // Try to use same nullifier
        vm.prank(bob);
        vm.expectRevert(PrivateVoting.NullifierAlreadyUsed.selector);
        voting.commitVote(1, commitment + 1, 200, nullifier, pA, pB, pC);
    }

    function test_RevertWhen_ZeroVotingPower() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        vm.expectRevert(PrivateVoting.ZeroVotingPower.selector);
        voting.commitVote(1, 123, 0, 456, pA, pB, pC); // votingPower = 0
    }

    function test_RevertWhen_InvalidProof() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        // Make verifier return false
        verifier.setVerificationResult(false);

        vm.expectRevert(PrivateVoting.InvalidProof.selector);
        voting.commitVote(1, 123, 100, 456, pA, pB, pC);
    }

    function test_RevertWhen_NotInCommitPhase() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        // Fast forward past commit phase
        vm.warp(block.timestamp + VOTING_DURATION + 1);

        vm.expectRevert(PrivateVoting.NotInCommitPhase.selector);
        voting.commitVote(1, 123, 100, 456, pA, pB, pC);
    }

    // ============ Reveal Phase Tests ============

    function test_RevealVote_For() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 proposalId = 1;
        uint256 votingPower = 100;
        uint256 voteSalt = 999;
        uint256 nullifier = 12345;
        uint256 choice = voting.CHOICE_FOR();

        uint256 commitment = computeCommitment(choice, votingPower, proposalId, voteSalt);

        // Commit
        vm.prank(alice);
        voting.commitVote(proposalId, commitment, votingPower, nullifier, pA, pB, pC);

        // Fast forward to reveal phase
        vm.warp(block.timestamp + VOTING_DURATION + 1);

        // Reveal
        vm.prank(alice);
        voting.revealVote(proposalId, nullifier, choice, voteSalt);

        // Verify reveal
        (,, bool revealed, uint256 revealedChoice) = voting.getCommitment(proposalId, nullifier);
        assertTrue(revealed);
        assertEq(revealedChoice, choice);

        // Verify tally
        (,,,,,,,uint256 forVotes,,,,,) = voting.getProposal(proposalId);
        assertEq(forVotes, votingPower);
    }

    function test_RevealVote_Against() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 choice = voting.CHOICE_AGAINST();
        uint256 votingPower = 150;
        uint256 voteSalt = 888;
        uint256 nullifier = 54321;

        uint256 commitment = computeCommitment(choice, votingPower, 1, voteSalt);

        vm.prank(alice);
        voting.commitVote(1, commitment, votingPower, nullifier, pA, pB, pC);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        vm.prank(alice);
        voting.revealVote(1, nullifier, choice, voteSalt);

        (,,,,,,,,uint256 againstVotes,,,,) = voting.getProposal(1);
        assertEq(againstVotes, votingPower);
    }

    function test_RevealVote_Abstain() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 choice = voting.CHOICE_ABSTAIN();
        uint256 votingPower = 75;
        uint256 voteSalt = 777;
        uint256 nullifier = 99999;

        uint256 commitment = computeCommitment(choice, votingPower, 1, voteSalt);

        vm.prank(alice);
        voting.commitVote(1, commitment, votingPower, nullifier, pA, pB, pC);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        vm.prank(alice);
        voting.revealVote(1, nullifier, choice, voteSalt);

        (,,,,,,,,,uint256 abstainVotes,,,) = voting.getProposal(1);
        assertEq(abstainVotes, votingPower);
    }

    function test_RevealVote_UpdatesRevealedCount() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        // Alice commits
        uint256 commitment1 = computeCommitment(1, 100, 1, 111);
        vm.prank(alice);
        voting.commitVote(1, commitment1, 100, 11111, pA, pB, pC);

        // Bob commits
        uint256 commitment2 = computeCommitment(0, 200, 1, 222);
        vm.prank(bob);
        voting.commitVote(1, commitment2, 200, 22222, pA, pB, pC);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        // Alice reveals
        vm.prank(alice);
        voting.revealVote(1, 11111, 1, 111);

        (,,,,,,,,,,,uint256 revealedVotes,) = voting.getProposal(1);
        assertEq(revealedVotes, 1);

        // Bob reveals
        vm.prank(bob);
        voting.revealVote(1, 22222, 0, 222);

        (,,,,,,,,,,,revealedVotes,) = voting.getProposal(1);
        assertEq(revealedVotes, 2);
    }

    function test_RevertWhen_InvalidReveal() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 commitment = computeCommitment(1, 100, 1, 999);

        vm.prank(alice);
        voting.commitVote(1, commitment, 100, 12345, pA, pB, pC);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        // Try to reveal with wrong salt
        vm.prank(alice);
        vm.expectRevert(PrivateVoting.InvalidReveal.selector);
        voting.revealVote(1, 12345, 1, 888); // Wrong salt
    }

    function test_RevertWhen_AlreadyRevealed() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 commitment = computeCommitment(1, 100, 1, 999);

        vm.prank(alice);
        voting.commitVote(1, commitment, 100, 12345, pA, pB, pC);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        vm.prank(alice);
        voting.revealVote(1, 12345, 1, 999);

        // Try to reveal again
        vm.prank(alice);
        vm.expectRevert(PrivateVoting.AlreadyRevealed.selector);
        voting.revealVote(1, 12345, 1, 999);
    }

    function test_RevertWhen_NotInRevealPhase_TooEarly() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 commitment = computeCommitment(1, 100, 1, 999);

        vm.prank(alice);
        voting.commitVote(1, commitment, 100, 12345, pA, pB, pC);

        // Still in commit phase
        vm.expectRevert(PrivateVoting.NotInRevealPhase.selector);
        voting.revealVote(1, 12345, 1, 999);
    }

    function test_RevertWhen_NotInRevealPhase_TooLate() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        uint256 commitment = computeCommitment(1, 100, 1, 999);

        vm.prank(alice);
        voting.commitVote(1, commitment, 100, 12345, pA, pB, pC);

        // Past reveal phase
        vm.warp(block.timestamp + VOTING_DURATION + REVEAL_DURATION + 1);

        vm.expectRevert(PrivateVoting.NotInRevealPhase.selector);
        voting.revealVote(1, 12345, 1, 999);
    }

    function test_RevertWhen_InvalidChoice() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        // Commit with invalid choice (3)
        uint256 commitment = computeCommitment(3, 100, 1, 999);

        vm.prank(alice);
        voting.commitVote(1, commitment, 100, 12345, pA, pB, pC);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        vm.expectRevert(PrivateVoting.InvalidChoice.selector);
        voting.revealVote(1, 12345, 3, 999); // Invalid choice
    }

    // ============ Phase Tests ============

    function test_GetPhase_Commit() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        assertEq(voting.getPhase(1), 0); // Commit phase
    }

    function test_GetPhase_Reveal() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        vm.warp(block.timestamp + VOTING_DURATION + 1);

        assertEq(voting.getPhase(1), 1); // Reveal phase
    }

    function test_GetPhase_Ended() public {
        voting.registerMerkleRoot(MERKLE_ROOT);
        voting.createProposal("Test", "Desc", MERKLE_ROOT, VOTING_DURATION, REVEAL_DURATION);

        vm.warp(block.timestamp + VOTING_DURATION + REVEAL_DURATION + 1);

        assertEq(voting.getPhase(1), 2); // Ended
    }

    // ============ Integration Test ============

    function test_FullVotingFlow() public {
        // 1. Register merkle root
        voting.registerMerkleRoot(MERKLE_ROOT);

        // 2. Create proposal
        voting.createProposal(
            "Treasury Allocation",
            "Allocate 10% of treasury to development",
            MERKLE_ROOT,
            VOTING_DURATION,
            REVEAL_DURATION
        );

        // 3. Alice commits FOR with 100 voting power
        uint256 aliceNullifier = 111;
        uint256 aliceSalt = 1001;
        uint256 aliceCommitment = computeCommitment(1, 100, 1, aliceSalt);

        vm.prank(alice);
        voting.commitVote(1, aliceCommitment, 100, aliceNullifier, pA, pB, pC);

        // 4. Bob commits AGAINST with 150 voting power
        uint256 bobNullifier = 222;
        uint256 bobSalt = 2002;
        uint256 bobCommitment = computeCommitment(0, 150, 1, bobSalt);

        vm.prank(bob);
        voting.commitVote(1, bobCommitment, 150, bobNullifier, pA, pB, pC);

        // 5. Charlie commits FOR with 200 voting power
        uint256 charlieNullifier = 333;
        uint256 charlieSalt = 3003;
        uint256 charlieCommitment = computeCommitment(1, 200, 1, charlieSalt);

        vm.prank(charlie);
        voting.commitVote(1, charlieCommitment, 200, charlieNullifier, pA, pB, pC);

        // Verify commit phase state
        (,,,,,,,,,,uint256 totalCommitments,,uint8 phase) = voting.getProposal(1);
        assertEq(totalCommitments, 3);
        assertEq(phase, 0); // Still commit phase

        // 6. Move to reveal phase
        vm.warp(block.timestamp + VOTING_DURATION + 1);

        // 7. All reveal their votes
        vm.prank(alice);
        voting.revealVote(1, aliceNullifier, 1, aliceSalt);

        vm.prank(bob);
        voting.revealVote(1, bobNullifier, 0, bobSalt);

        vm.prank(charlie);
        voting.revealVote(1, charlieNullifier, 1, charlieSalt);

        // 8. Verify final tally
        (
            ,,,,,,,
            uint256 forVotes,
            uint256 againstVotes,
            uint256 abstainVotes,
            ,
            uint256 revealedVotes,
            uint8 finalPhase
        ) = voting.getProposal(1);

        assertEq(forVotes, 300);      // Alice (100) + Charlie (200)
        assertEq(againstVotes, 150);  // Bob (150)
        assertEq(abstainVotes, 0);
        assertEq(revealedVotes, 3);
        assertEq(finalPhase, 1);      // Reveal phase

        // 9. Move to ended phase
        vm.warp(block.timestamp + REVEAL_DURATION + 1);

        assertEq(voting.getPhase(1), 2); // Ended

        // FOR wins: 300 > 150
    }
}
