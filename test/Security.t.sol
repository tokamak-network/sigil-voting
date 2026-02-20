// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/MACI.sol";
import "../contracts/Poll.sol";
import "../contracts/MessageProcessor.sol";
import "../contracts/Tally.sol";
import "../contracts/AccQueue.sol";
import "../contracts/VkRegistry.sol";
import "../contracts/IVerifier.sol";
import "../contracts/gatekeepers/FreeForAllGatekeeper.sol";
import "../contracts/voiceCreditProxy/ConstantVoiceCreditProxy.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

/// @dev Mock verifier for security tests
contract SecurityMockVerifier is IVerifier {
    bool public returnValue = true;

    function setReturnValue(bool _val) external {
        returnValue = _val;
    }

    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[] calldata)
        external
        view
        override
        returns (bool)
    {
        return returnValue;
    }
}

/// @dev Simple ERC20 mock
contract SecurityMockERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

contract SecurityTest is Test {
    MACI public maci;
    FreeForAllGatekeeper public gatekeeper;
    ConstantVoiceCreditProxy public voiceCreditProxy;
    SecurityMockVerifier public mpVerifier;
    SecurityMockVerifier public tallyVerifier;
    VkRegistry public vkRegistry;
    AccQueue public stateAq;

    uint256 constant VOICE_CREDITS = 100;
    uint8 constant STATE_TREE_DEPTH = 2;
    uint8 constant MSG_TREE_DEPTH = 2;
    uint256 constant POLL_DURATION = 3600;
    uint256 constant COORD_PUB_KEY_X = 111;
    uint256 constant COORD_PUB_KEY_Y = 222;

    address constant ATTACKER = address(0xDEAD);

    function setUp() public {
        gatekeeper = new FreeForAllGatekeeper();
        voiceCreditProxy = new ConstantVoiceCreditProxy(VOICE_CREDITS);
        mpVerifier = new SecurityMockVerifier();
        tallyVerifier = new SecurityMockVerifier();
        vkRegistry = new VkRegistry();

        stateAq = new AccQueue(5, 2);
        maci = new MACI(address(gatekeeper), address(voiceCreditProxy), STATE_TREE_DEPTH, address(stateAq));
        stateAq.transferOwnership(address(maci));
        maci.init();
    }

    // Helper: deploy a poll and return all addresses
    function _deployPoll() internal returns (address pollAddr, address mpAddr, address tallyAddr) {
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Security Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );
        pollAddr = maci.polls(0);
        mpAddr = address(new MessageProcessor(pollAddr, address(mpVerifier), address(vkRegistry), address(this)));
        tallyAddr = address(new Tally(pollAddr, mpAddr, address(tallyVerifier), address(vkRegistry), address(this)));
    }

    // Helper: complete full pipeline through tally
    function _completePipeline() internal returns (address pollAddr, address mpAddr, address tallyAddr) {
        (pollAddr, mpAddr, tallyAddr) = _deployPoll();
        Poll poll = Poll(pollAddr);

        uint256[10] memory encMsg;
        encMsg[0] = 42;
        poll.publishMessage(encMsg, 333, 444);

        vm.warp(block.timestamp + POLL_DURATION + 1);
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        MessageProcessor mp = MessageProcessor(mpAddr);
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        mp.processMessages(12345, pA, pB, pC);
        mp.completeProcessing();
    }

    // ==========================================
    // ACCESS CONTROL (10 tests)
    // ==========================================

    /// @notice AccQueue.enqueue() should reject non-owner callers
    function test_AccQueue_Enqueue_NotOwner_Reverts() public {
        AccQueue aq = new AccQueue(5, 2);
        // aq.owner() = address(this), so ATTACKER is not owner
        vm.prank(ATTACKER);
        vm.expectRevert(AccQueue.NotOwner.selector);
        aq.enqueue(123);
    }

    /// @notice Tally.tallyVotes() should reject non-coordinator callers
    function test_Tally_TallyVotes_NotCoordinator_Reverts() public {
        (, address mpAddr, address tallyAddr) = _completePipeline();
        Tally tally = Tally(tallyAddr);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.prank(ATTACKER);
        vm.expectRevert(Tally.NotCoordinator.selector);
        tally.tallyVotes(99999, pA, pB, pC);
    }

    /// @notice Tally.publishResults() should reject non-coordinator callers
    function test_Tally_PublishResults_NotCoordinator_Reverts() public {
        (,, address tallyAddr) = _completePipeline();
        Tally tally = Tally(tallyAddr);

        vm.prank(ATTACKER);
        vm.expectRevert(Tally.NotCoordinator.selector);
        tally.publishResults(1, 0, 0, 1, 111, 222, 333);
    }

    /// @notice MP.processMessages() should reject non-coordinator callers
    function test_MP_ProcessMessages_NotCoordinator_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        Poll poll = Poll(pollAddr);

        uint256[10] memory encMsg;
        poll.publishMessage(encMsg, 333, 444);
        vm.warp(block.timestamp + POLL_DURATION + 1);
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        MessageProcessor mp = new MessageProcessor(pollAddr, address(mpVerifier), address(vkRegistry), address(this));

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.prank(ATTACKER);
        vm.expectRevert(MessageProcessor.NotCoordinator.selector);
        mp.processMessages(12345, pA, pB, pC);
    }

    /// @notice MP.setExpectedBatchCount() should reject non-coordinator callers
    function test_MP_SetExpectedBatchCount_NotCoordinator_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        MessageProcessor mp = new MessageProcessor(pollAddr, address(mpVerifier), address(vkRegistry), address(this));

        vm.prank(ATTACKER);
        vm.expectRevert(MessageProcessor.NotCoordinator.selector);
        mp.setExpectedBatchCount(5);
    }

    /// @notice MP.completeProcessing() should reject non-coordinator callers
    function test_MP_CompleteProcessing_NotCoordinator_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        MessageProcessor mp = new MessageProcessor(pollAddr, address(mpVerifier), address(vkRegistry), address(this));

        vm.prank(ATTACKER);
        vm.expectRevert(MessageProcessor.NotCoordinator.selector);
        mp.completeProcessing();
    }

    /// @notice MACI.init() should only be callable by owner
    function test_MACI_Init_NotOwner_Reverts() public {
        AccQueue newAq = new AccQueue(5, 2);
        MACI newMaci = new MACI(address(gatekeeper), address(voiceCreditProxy), STATE_TREE_DEPTH, address(newAq));
        newAq.transferOwnership(address(newMaci));

        vm.prank(ATTACKER);
        vm.expectRevert(MACI.NotOwner.selector);
        newMaci.init();
    }

    /// @notice MACI.transferOwnership() should reject non-owner callers
    function test_MACI_TransferOwnership_NotOwner_Reverts() public {
        vm.prank(ATTACKER);
        vm.expectRevert(MACI.NotOwner.selector);
        maci.transferOwnership(address(0xBEEF));
    }

    /// @notice MACI.addProposalGate() should reject non-owner callers
    function test_MACI_AddProposalGate_NotOwner_Reverts() public {
        vm.prank(ATTACKER);
        vm.expectRevert(MACI.NotOwner.selector);
        maci.addProposalGate(address(0x1), 100);
    }

    /// @notice MACI.clearProposalGates() should reject non-owner callers
    function test_MACI_ClearProposalGates_NotOwner_Reverts() public {
        vm.prank(ATTACKER);
        vm.expectRevert(MACI.NotOwner.selector);
        maci.clearProposalGates();
    }

    // ==========================================
    // INPUT VALIDATION (10 tests)
    // ==========================================

    /// @notice AccQueue.enqueue() should reject values >= SNARK_SCALAR_FIELD
    function test_AccQueue_Enqueue_MaxFieldValue_Reverts() public {
        AccQueue aq = new AccQueue(5, 2);
        uint256 snarkField = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        vm.expectRevert(AccQueue.LeafTooLarge.selector);
        aq.enqueue(snarkField);
    }

    /// @notice AccQueue.enqueue() should succeed with zero value
    function test_AccQueue_Enqueue_ZeroValue_Succeeds() public {
        AccQueue aq = new AccQueue(5, 2);
        uint256 idx = aq.enqueue(0);
        assertEq(idx, 0);
    }

    /// @notice Tally.publishResults() with zero votes should succeed (empty poll)
    function test_Tally_PublishResults_ZeroVotes() public {
        (, address mpAddr, address tallyAddr) = _completePipeline();
        Tally tally = Tally(tallyAddr);

        uint256 tallyResultsRoot = 111;
        uint256 totalSpent = 222;
        uint256 perOptionSpentRoot = 333;
        uint256 commitment = PoseidonT4.hash([tallyResultsRoot, totalSpent, perOptionSpentRoot]);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        tally.tallyVotes(commitment, pA, pB, pC);
        tally.publishResults(0, 0, 0, 0, tallyResultsRoot, totalSpent, perOptionSpentRoot);

        assertTrue(tally.tallyVerified());
        assertEq(tally.forVotes(), 0);
    }

    /// @notice Tally.publishResults() should revert when voters exceed signups
    function test_Tally_PublishResults_VoterCountExceedsSignups_Reverts() public {
        (, address mpAddr, address tallyAddr) = _completePipeline();
        Tally tally = Tally(tallyAddr);

        uint256 tallyResultsRoot = 111;
        uint256 totalSpent = 222;
        uint256 perOptionSpentRoot = 333;
        uint256 commitment = PoseidonT4.hash([tallyResultsRoot, totalSpent, perOptionSpentRoot]);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        tally.tallyVotes(commitment, pA, pB, pC);

        // numSignUps=1, try totalVoters=100
        vm.expectRevert(Tally.VoterCountExceedsSignups.selector);
        tally.publishResults(50, 50, 0, 100, tallyResultsRoot, totalSpent, perOptionSpentRoot);
    }

    /// @notice Poll.publishMessage() should revert after voting ended
    function test_Poll_PublishMessage_AfterVotingEnded_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        Poll poll = Poll(pollAddr);
        vm.warp(block.timestamp + POLL_DURATION + 1);

        uint256[10] memory encMsg;
        vm.expectRevert(Poll.VotingEnded.selector);
        poll.publishMessage(encMsg, 333, 444);
    }

    /// @notice Poll.publishMessage() should revert with zero encPubKey (identity point)
    function test_Poll_PublishMessage_ZeroEncPubKey_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        Poll poll = Poll(pollAddr);

        uint256[10] memory encMsg;
        vm.expectRevert(Poll.ZeroEncPubKey.selector);
        poll.publishMessage(encMsg, 0, 0);
    }

    /// @notice MACI.signUp() should succeed with zero public key (edge case)
    function test_MACI_SignUp_ZeroPublicKey() public {
        // Zero pubkey is technically valid — circuit treats it as blank leaf routing target
        maci.signUp(0, 0, "", "");
        assertEq(maci.numSignUps(), 1);
    }

    /// @notice MACI.deployPoll() should revert with zero duration
    function test_MACI_DeployPoll_ZeroDuration_Reverts() public {
        vm.expectRevert(MACI.ZeroDuration.selector);
        maci.deployPoll(
            "Zero Duration",
            0, // zero duration
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );
    }

    /// @notice MACI.deployPoll() should revert with zero messageTreeDepth
    function test_MACI_DeployPoll_ZeroMessageTreeDepth_Reverts() public {
        vm.expectRevert(MACI.ZeroMessageTreeDepth.selector);
        maci.deployPoll(
            "Zero Depth",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            0 // zero depth
        );
    }

    /// @notice MACI.addProposalGate() should revert with zero address
    function test_MACI_AddProposalGate_ZeroAddress_Reverts() public {
        vm.expectRevert(MACI.ZeroAddress.selector);
        maci.addProposalGate(address(0), 100);
    }

    // ==========================================
    // STATE MACHINE INVARIANTS (5 tests)
    // ==========================================

    /// @notice AccQueue.resetMerge() should emit MergeReset event
    function test_AccQueue_ResetMerge_EmitsEvent() public {
        AccQueue aq = new AccQueue(5, 2);
        // Enqueue enough leaves for a merge
        for (uint256 i = 0; i < 25; i++) {
            aq.enqueue(i + 1);
        }
        aq.mergeSubRoots(0);
        aq.merge();

        vm.expectEmit(false, false, false, false);
        emit AccQueue.MergeReset();
        aq.resetMerge();
    }

    /// @notice MACI.signUp() should revert before init()
    function test_MACI_SignUp_BeforeInit_Reverts() public {
        AccQueue newAq = new AccQueue(5, 2);
        MACI newMaci = new MACI(address(gatekeeper), address(voiceCreditProxy), STATE_TREE_DEPTH, address(newAq));
        newAq.transferOwnership(address(newMaci));
        // Do NOT call init()

        vm.expectRevert(MACI.NotInitialized.selector);
        newMaci.signUp(100, 200, "", "");
    }

    /// @notice Tally.tallyVotes() should revert before processing is complete
    function test_Tally_TallyVotes_BeforeProcessingComplete_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        Poll poll = Poll(pollAddr);

        uint256[10] memory encMsg;
        poll.publishMessage(encMsg, 333, 444);
        vm.warp(block.timestamp + POLL_DURATION + 1);
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        // Create MP but do NOT complete processing
        MessageProcessor mp = new MessageProcessor(pollAddr, address(mpVerifier), address(vkRegistry), address(this));

        Tally tally = new Tally(pollAddr, address(mp), address(tallyVerifier), address(vkRegistry), address(this));

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.expectRevert(Tally.ProcessingNotDone.selector);
        tally.tallyVotes(99999, pA, pB, pC);
    }

    /// @notice MP.completeProcessing() should revert without any batch processed
    function test_MP_CompleteProcessing_WithoutAnyBatch_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        MessageProcessor mp = new MessageProcessor(pollAddr, address(mpVerifier), address(vkRegistry), address(this));

        vm.expectRevert(MessageProcessor.NoBatchesProcessed.selector);
        mp.completeProcessing();
    }

    /// @notice Poll merge functions should revert before voting ends
    function test_Poll_MergeFunctions_BeforeVotingEnded_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        Poll poll = Poll(pollAddr);

        vm.expectRevert(Poll.VotingNotEnded.selector);
        poll.mergeMaciStateAqSubRoots(0);

        vm.expectRevert(Poll.VotingNotEnded.selector);
        poll.mergeMaciStateAq();

        vm.expectRevert(Poll.VotingNotEnded.selector);
        poll.mergeMessageAqSubRoots(0);

        vm.expectRevert(Poll.VotingNotEnded.selector);
        poll.mergeMessageAq();
    }

    // ==========================================
    // EDGE CASES (5 tests)
    // ==========================================

    /// @notice Deploying many polls should work correctly
    function test_MACI_DeployPoll_MaxPollId() public {
        // Deploy 5 polls in sequence
        for (uint256 i = 0; i < 5; i++) {
            maci.deployPoll(
                "Poll",
                POLL_DURATION,
                COORD_PUB_KEY_X,
                COORD_PUB_KEY_Y,
                address(mpVerifier),
                address(tallyVerifier),
                address(vkRegistry),
                MSG_TREE_DEPTH
            );
        }
        assertEq(maci.nextPollId(), 5);
        assertTrue(maci.polls(4) != address(0));
    }

    /// @notice Publishing max messages to a poll
    function test_Poll_PublishMessage_MaxMessages() public {
        (address pollAddr,,) = _deployPoll();
        Poll poll = Poll(pollAddr);

        // Publish 30 messages (more than subtree capacity for depth=2: 5^2=25)
        for (uint256 i = 0; i < 30; i++) {
            uint256[10] memory encMsg;
            encMsg[0] = i + 1;
            poll.publishMessage(encMsg, uint256(i + 100), uint256(i + 200));
        }
        assertEq(poll.numMessages(), 30);
    }

    /// @notice Double resetMerge should succeed (idempotent)
    function test_AccQueue_DoubleResetMerge_Succeeds() public {
        AccQueue aq = new AccQueue(5, 2);
        for (uint256 i = 0; i < 25; i++) {
            aq.enqueue(i + 1);
        }
        aq.mergeSubRoots(0);
        aq.merge();

        aq.resetMerge();
        assertFalse(aq.isMerged());

        // Reset again — should not revert
        aq.resetMerge();
        assertFalse(aq.isMerged());
    }

    /// @notice Tally.publishResults() should revert when commitment doesn't match
    function test_Tally_PublishResults_CommitmentMismatch_Reverts() public {
        (, address mpAddr, address tallyAddr) = _completePipeline();
        Tally tally = Tally(tallyAddr);

        // Compute a valid commitment
        uint256 tallyResultsRoot = 111;
        uint256 totalSpent = 222;
        uint256 perOptionSpentRoot = 333;
        uint256 commitment = PoseidonT4.hash([tallyResultsRoot, totalSpent, perOptionSpentRoot]);

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        tally.tallyVotes(commitment, pA, pB, pC);

        // Try to publish with wrong roots
        vm.expectRevert(Tally.TallyCommitmentMismatch.selector);
        tally.publishResults(50, 50, 0, 1, 999, 888, 777);
    }

    /// @notice MACI.transferOwnership() to zero address should revert
    function test_MACI_TransferOwnership_ToZeroAddress_Reverts() public {
        vm.expectRevert(MACI.ZeroAddress.selector);
        maci.transferOwnership(address(0));
    }

    // ==========================================
    // CONSTRUCTOR VALIDATION (5 extra tests)
    // ==========================================

    /// @notice Tally constructor should revert with zero poll address
    function test_Tally_Constructor_ZeroPoll_Reverts() public {
        vm.expectRevert(Tally.ZeroAddress.selector);
        new Tally(address(0), address(0x1), address(tallyVerifier), address(vkRegistry), address(this));
    }

    /// @notice Tally constructor should revert with zero coordinator
    function test_Tally_Constructor_ZeroCoordinator_Reverts() public {
        vm.expectRevert(Tally.ZeroAddress.selector);
        new Tally(address(0x1), address(0x2), address(tallyVerifier), address(vkRegistry), address(0));
    }

    /// @notice MP constructor should revert with zero poll address
    function test_MP_Constructor_ZeroPoll_Reverts() public {
        vm.expectRevert(MessageProcessor.ZeroAddress.selector);
        new MessageProcessor(address(0), address(mpVerifier), address(vkRegistry), address(this));
    }

    /// @notice MP constructor should revert with zero verifier
    function test_MP_Constructor_ZeroVerifier_Reverts() public {
        vm.expectRevert(MessageProcessor.ZeroAddress.selector);
        new MessageProcessor(address(0x1), address(0), address(vkRegistry), address(this));
    }

    /// @notice MP.setExpectedBatchCount() with zero should revert
    function test_MP_SetExpectedBatchCount_Zero_Reverts() public {
        (address pollAddr,,) = _deployPoll();
        MessageProcessor mp = new MessageProcessor(pollAddr, address(mpVerifier), address(vkRegistry), address(this));

        vm.expectRevert(MessageProcessor.ZeroBatchCount.selector);
        mp.setExpectedBatchCount(0);
    }
}
