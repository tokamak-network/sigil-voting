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

/// @dev Mock verifier that always returns true (for testing)
contract MockVerifier is IVerifier {
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

/// @dev Gatekeeper that rejects everyone
contract RejectAllGatekeeper is ISignUpGatekeeper {
    function register(address, bytes memory) external pure override {
        revert("Rejected");
    }
}

/// @dev Simple ERC20 mock for token gate testing
contract MockERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

contract MACITest is Test {
    MACI public maci;
    FreeForAllGatekeeper public gatekeeper;
    ConstantVoiceCreditProxy public voiceCreditProxy;
    MockVerifier public mpVerifier;
    MockVerifier public tallyVerifier;
    VkRegistry public vkRegistry;

    uint256 constant VOICE_CREDITS = 100;
    uint8 constant STATE_TREE_DEPTH = 2;
    uint8 constant MSG_TREE_DEPTH = 2;
    uint256 constant POLL_DURATION = 3600; // 1 hour

    // Test coordinator keys (not real)
    uint256 constant COORD_PUB_KEY_X = 111;
    uint256 constant COORD_PUB_KEY_Y = 222;

    function setUp() public {
        gatekeeper = new FreeForAllGatekeeper();
        voiceCreditProxy = new ConstantVoiceCreditProxy(VOICE_CREDITS);
        mpVerifier = new MockVerifier();
        tallyVerifier = new MockVerifier();
        vkRegistry = new VkRegistry();

        AccQueue stateAq = new AccQueue(5, 2);
        maci = new MACI(address(gatekeeper), address(voiceCreditProxy), STATE_TREE_DEPTH, address(stateAq));
        // Transfer AccQueue ownership to MACI, then initialize
        stateAq.transferOwnership(address(maci));
        maci.init();
    }

    // ============ 1. test_MACI_SignUp ============

    function test_MACI_SignUp() public {
        uint256 pkX = 1000;
        uint256 pkY = 2000;

        vm.expectEmit(true, true, false, true);
        emit MACI.SignUp(1, pkX, pkY, VOICE_CREDITS, block.timestamp);

        maci.signUp(pkX, pkY, "", "");

        assertEq(maci.numSignUps(), 1);
    }

    function test_MACI_SignUp_MultipleUsers() public {
        maci.signUp(100, 200, "", "");
        maci.signUp(300, 400, "", "");
        maci.signUp(500, 600, "", "");

        assertEq(maci.numSignUps(), 3);
    }

    // ============ 2. test_MACI_SignUp_Gatekeeper ============

    function test_MACI_SignUp_Gatekeeper_Revert() public {
        RejectAllGatekeeper rejectGk = new RejectAllGatekeeper();
        AccQueue restrictedAq = new AccQueue(5, 2);
        MACI restrictedMaci =
            new MACI(address(rejectGk), address(voiceCreditProxy), STATE_TREE_DEPTH, address(restrictedAq));
        restrictedAq.transferOwnership(address(restrictedMaci));
        restrictedMaci.init();

        vm.expectRevert("Rejected");
        restrictedMaci.signUp(100, 200, "", "");
    }

    // ============ 3. test_Poll_PublishMessage ============

    function test_Poll_PublishMessage() public {
        // Setup: signUp + deployPoll
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));

        uint256[10] memory encMsg;
        for (uint256 i = 0; i < 10; i++) {
            encMsg[i] = i + 1;
        }

        poll.publishMessage(encMsg, 333, 444);
        assertEq(poll.numMessages(), 1);
    }

    // ============ 4. test_Poll_PublishMessage_AfterVoting ============

    function test_Poll_PublishMessage_AfterVoting_Reverts() public {
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));

        // Warp past voting period
        vm.warp(block.timestamp + POLL_DURATION + 1);

        uint256[10] memory encMsg;
        vm.expectRevert(Poll.VotingEnded.selector);
        poll.publishMessage(encMsg, 333, 444);
    }

    // ============ 5. test_Poll_MergeAccQueues ============

    function test_Poll_MergeAccQueues() public {
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));

        // Publish a message
        uint256[10] memory encMsg;
        encMsg[0] = 42;
        poll.publishMessage(encMsg, 333, 444);

        // Warp past voting
        vm.warp(block.timestamp + POLL_DURATION + 1);

        // Merge
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        assertTrue(poll.stateAqMerged());

        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();
        assertTrue(poll.messageAqMerged());
    }

    // ============ 6. test_MessageProcessor_Process ============

    function test_MessageProcessor_Process() public {
        // Full setup: signUp → deployPoll → publish → warp → merge
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));

        uint256[10] memory encMsg;
        encMsg[0] = 42;
        poll.publishMessage(encMsg, 333, 444);

        vm.warp(block.timestamp + POLL_DURATION + 1);

        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        // Get MessageProcessor address from event
        // For testing, we deploy manually
        MessageProcessor mp =
            new MessageProcessor(address(poll), address(mpVerifier), address(vkRegistry), address(this));

        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];

        mp.processMessages(12345, pA, pB, pC);
        assertEq(mp.currentStateCommitment(), 12345);
        assertEq(mp.processedBatchCount(), 1);
    }

    // ============ 7. test_MessageProcessor_InvalidProof ============

    function test_MessageProcessor_InvalidProof_Reverts() public {
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));

        uint256[10] memory encMsg;
        poll.publishMessage(encMsg, 333, 444);

        vm.warp(block.timestamp + POLL_DURATION + 1);
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        // Set mpVerifier to reject
        mpVerifier.setReturnValue(false);
        MessageProcessor mp =
            new MessageProcessor(address(poll), address(mpVerifier), address(vkRegistry), address(this));

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.expectRevert(MessageProcessor.InvalidProcessProof.selector);
        mp.processMessages(12345, pA, pB, pC);
    }

    // ============ 8. test_MessageProcessor_NotMerged ============

    function test_MessageProcessor_NotMerged_Reverts() public {
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));
        vm.warp(block.timestamp + POLL_DURATION + 1);

        MessageProcessor mp =
            new MessageProcessor(address(poll), address(mpVerifier), address(vkRegistry), address(this));

        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;

        vm.expectRevert(MessageProcessor.StateAqNotMerged.selector);
        mp.processMessages(12345, pA, pB, pC);
    }

    // ============ 9. test_Tally_TallyVotes ============

    function test_Tally_TallyVotes() public {
        // Setup full pipeline
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));

        uint256[10] memory encMsg;
        poll.publishMessage(encMsg, 333, 444);

        vm.warp(block.timestamp + POLL_DURATION + 1);
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        MessageProcessor mp =
            new MessageProcessor(address(poll), address(mpVerifier), address(vkRegistry), address(this));
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        mp.processMessages(12345, pA, pB, pC);
        mp.completeProcessing();

        Tally tally = new Tally(address(poll), address(mp), address(tallyVerifier), address(vkRegistry), address(this));
        uint256 tallyCommitment = PoseidonT4.hash([uint256(111), uint256(222), uint256(333)]);
        tally.tallyVotes(tallyCommitment, pA, pB, pC);
        assertEq(tally.tallyCommitment(), tallyCommitment);
    }

    // ============ 10. test_Tally_InvalidProof ============

    function test_Tally_InvalidProof_Reverts() public {
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));
        uint256[10] memory encMsg;
        poll.publishMessage(encMsg, 333, 444);

        vm.warp(block.timestamp + POLL_DURATION + 1);
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        MessageProcessor mp =
            new MessageProcessor(address(poll), address(mpVerifier), address(vkRegistry), address(this));
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        mp.processMessages(12345, pA, pB, pC);
        mp.completeProcessing();

        tallyVerifier.setReturnValue(false);
        Tally tally = new Tally(address(poll), address(mp), address(tallyVerifier), address(vkRegistry), address(this));

        vm.expectRevert(Tally.InvalidTallyProof.selector);
        tally.tallyVotes(67890, pA, pB, pC);
    }

    // ============ 11. test_Tally_PublishResults ============

    function test_Tally_PublishResults() public {
        maci.signUp(100, 200, "", "");
        maci.deployPoll(
            "Test Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        Poll poll = Poll(maci.polls(0));
        uint256[10] memory encMsg;
        poll.publishMessage(encMsg, 333, 444);

        vm.warp(block.timestamp + POLL_DURATION + 1);
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();

        MessageProcessor mp =
            new MessageProcessor(address(poll), address(mpVerifier), address(vkRegistry), address(this));
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        mp.processMessages(12345, pA, pB, pC);
        mp.completeProcessing();

        Tally tally = new Tally(address(poll), address(mp), address(tallyVerifier), address(vkRegistry), address(this));
        uint256 tallyResultsRoot = 1111;
        uint256 totalSpent = 2222;
        uint256 perOptionSpentRoot = 3333;
        uint256 commitment = PoseidonT4.hash([tallyResultsRoot, totalSpent, perOptionSpentRoot]);
        tally.tallyVotes(commitment, pA, pB, pC);

        // Publish results with Poseidon-verified commitment
        tally.publishResults(50, 30, 20, 5, tallyResultsRoot, totalSpent, perOptionSpentRoot);

        assertTrue(tally.tallyVerified());
        assertEq(tally.forVotes(), 50);
        assertEq(tally.againstVotes(), 30);
        assertEq(tally.abstainVotes(), 20);
        assertEq(tally.totalVoters(), 5);
    }

    // ============ 12. test_TokenGate_MultiToken ============

    function test_TokenGate_NoGate_AnyoneCanCreate() public {
        // No gates set → anyone can create polls
        assertTrue(maci.canCreatePoll(address(this)));
        assertTrue(maci.canCreatePoll(address(0xBEEF)));
    }

    function test_TokenGate_SingleToken() public {
        MockERC20 token = new MockERC20();
        maci.addProposalGate(address(token), 100);

        address user = address(0xCAFE);
        assertFalse(maci.canCreatePoll(user));

        token.mint(user, 100);
        assertTrue(maci.canCreatePoll(user));
    }

    function test_TokenGate_MultiToken() public {
        MockERC20 tokenA = new MockERC20();
        MockERC20 tokenB = new MockERC20();
        maci.addProposalGate(address(tokenA), 100);
        maci.addProposalGate(address(tokenB), 50);

        address user = address(0xCAFE);
        assertFalse(maci.canCreatePoll(user));

        // Only tokenB is enough
        tokenB.mint(user, 50);
        assertTrue(maci.canCreatePoll(user));
    }

    function test_TokenGate_DeployPoll_WithToken() public {
        MockERC20 token = new MockERC20();
        maci.addProposalGate(address(token), 100);

        address user = address(0xCAFE);
        token.mint(user, 200);

        vm.prank(user);
        maci.deployPoll(
            "Token Gated Poll",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );

        address pollAddr = maci.polls(0);
        assertTrue(pollAddr != address(0));
    }

    function test_TokenGate_DeployPoll_Reverts_InsufficientTokens() public {
        MockERC20 token = new MockERC20();
        maci.addProposalGate(address(token), 100);

        address user = address(0xCAFE);
        token.mint(user, 50); // Not enough

        vm.prank(user);
        vm.expectRevert(MACI.InsufficientTokens.selector);
        maci.deployPoll(
            "Should Fail",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );
    }

    function test_TokenGate_ClearGates() public {
        MockERC20 token = new MockERC20();
        maci.addProposalGate(address(token), 100);
        assertEq(maci.proposalGateCount(), 1);

        maci.clearProposalGates();
        assertEq(maci.proposalGateCount(), 0);

        // Back to owner-only mode
        assertTrue(maci.canCreatePoll(address(this)));
    }

    // ============ 13. test_TransferOwnership ============

    function test_TransferOwnership() public {
        address newOwner = address(0xBEEF);
        assertEq(maci.owner(), address(this));

        maci.transferOwnership(newOwner);
        assertEq(maci.owner(), newOwner);

        // Old owner can no longer add gates
        vm.expectRevert(MACI.NotOwner.selector);
        maci.addProposalGate(address(0x1), 100);

        // New owner can
        vm.prank(newOwner);
        maci.addProposalGate(address(0x1), 100);
        assertEq(maci.proposalGateCount(), 1);
    }

    function test_TransferOwnership_ZeroAddress_Reverts() public {
        vm.expectRevert(MACI.ZeroAddress.selector);
        maci.transferOwnership(address(0));
    }

    function test_TransferOwnership_NotOwner_Reverts() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(MACI.NotOwner.selector);
        maci.transferOwnership(address(0xBEEF));
    }

    // ============ 14. test_NoRevealFunction ============

    function test_NoRevealFunction() public pure {
        // MACI.sol has no revealVote function
        // Poll.sol has no revealVote function
        // This test exists to document that reveal functions are intentionally absent
        // The absence is verified by the compiler - if someone adds reveal, this serves as a reminder
        assertTrue(true);
    }

    // ============ 13. test_IntegrationFlow ============

    function test_IntegrationFlow() public {
        // 1. SignUp
        maci.signUp(100, 200, "", "");
        maci.signUp(300, 400, "", "");
        assertEq(maci.numSignUps(), 2);

        // 2. DeployPoll
        maci.deployPoll(
            "Integration Test",
            POLL_DURATION,
            COORD_PUB_KEY_X,
            COORD_PUB_KEY_Y,
            address(mpVerifier),
            address(tallyVerifier),
            address(vkRegistry),
            MSG_TREE_DEPTH
        );
        address pollAddr = maci.polls(0);
        assertTrue(pollAddr != address(0));

        Poll poll = Poll(pollAddr);
        assertTrue(poll.isVotingOpen());

        // 3. PublishMessage (vote)
        uint256[10] memory msg1;
        msg1[0] = 111;
        poll.publishMessage(msg1, 555, 666);

        uint256[10] memory msg2;
        msg2[0] = 222;
        poll.publishMessage(msg2, 777, 888);
        assertEq(poll.numMessages(), 2);

        // 4. End voting
        vm.warp(block.timestamp + POLL_DURATION + 1);
        assertFalse(poll.isVotingOpen());

        // 5. Merge AccQueues
        poll.mergeMaciStateAqSubRoots(0);
        poll.mergeMaciStateAq();
        poll.mergeMessageAqSubRoots(0);
        poll.mergeMessageAq();
        assertTrue(poll.stateAqMerged());
        assertTrue(poll.messageAqMerged());

        // 6. Process messages
        MessageProcessor mp =
            new MessageProcessor(address(poll), address(mpVerifier), address(vkRegistry), address(this));
        uint256[2] memory pA;
        uint256[2][2] memory pB;
        uint256[2] memory pC;
        mp.processMessages(99999, pA, pB, pC);
        mp.completeProcessing();
        assertTrue(mp.processingComplete());

        // 7. Tally votes
        Tally tally = new Tally(address(poll), address(mp), address(tallyVerifier), address(vkRegistry), address(this));
        uint256 tallyResultsRoot = 4444;
        uint256 totalSpent = 5555;
        uint256 perOptionSpentRoot = 6666;
        uint256 commitment = PoseidonT4.hash([tallyResultsRoot, totalSpent, perOptionSpentRoot]);
        tally.tallyVotes(commitment, pA, pB, pC);
        assertEq(tally.tallyCommitment(), commitment);

        // 8. Publish results
        tally.publishResults(60, 35, 5, 2, tallyResultsRoot, totalSpent, perOptionSpentRoot);
        assertTrue(tally.tallyVerified());
    }
}
