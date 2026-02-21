// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/governance/TimelockExecutor.sol";

/* ── Mock Contracts ──────────────────────────────────────────────── */

contract MockTally {
    bool public tallyVerified;
    uint256 public forVotes;
    uint256 public againstVotes;
    uint256 public totalVoters;

    function setTallyVerified(bool v) external {
        tallyVerified = v;
    }

    function setForVotes(uint256 v) external {
        forVotes = v;
    }

    function setAgainstVotes(uint256 v) external {
        againstVotes = v;
    }

    function setTotalVoters(uint256 v) external {
        totalVoters = v;
    }
}

contract MockMACI {
    address public owner;

    function setOwner(address o) external {
        owner = o;
    }
}

contract MockTarget {
    uint256 public value;

    function setValue(uint256 v) external {
        value = v;
    }
}

/* ── Tests ───────────────────────────────────────────────────────── */

contract TimelockExecutorTest is Test {
    TimelockExecutor public executor;
    MockTally public tally;
    MockMACI public mockMaci;
    MockTarget public target;

    address creator = address(0xA1);
    address nonOwner = address(0xB2);
    address maciOwner = address(0xC3);

    uint256 constant POLL_ID = 1;
    uint256 constant DELAY = 7200; // 2 hours
    uint256 constant QUORUM = 5;

    function setUp() public {
        mockMaci = new MockMACI();
        mockMaci.setOwner(maciOwner);

        tally = new MockTally();
        target = new MockTarget();

        executor = new TimelockExecutor(address(mockMaci));
    }

    /* ── Helper ──────────────────────────────────────────────────── */

    function _register(uint256 pollId) internal {
        vm.prank(creator);
        executor.registerExecution(
            pollId, address(tally), address(target), abi.encodeCall(MockTarget.setValue, (42)), DELAY, QUORUM
        );
    }

    function _setTallyPassed() internal {
        tally.setTallyVerified(true);
        tally.setForVotes(100);
        tally.setAgainstVotes(50);
        tally.setTotalVoters(10);
    }

    /* ── 1. registerExecution success ────────────────────────────── */

    function test_registerExecution() public {
        _register(POLL_ID);

        (address c, address t, address tgt,,, uint256 q,, TimelockExecutor.ExecutionState s) =
            executor.getExecution(POLL_ID);

        assertEq(c, creator);
        assertEq(t, address(tally));
        assertEq(tgt, address(target));
        assertEq(q, QUORUM);
        assertEq(uint8(s), uint8(TimelockExecutor.ExecutionState.Registered));
    }

    /* ── 2. registerExecution duplicate reverts ──────────────────── */

    function test_registerExecution_duplicate_reverts() public {
        _register(POLL_ID);

        vm.prank(creator);
        vm.expectRevert(TimelockExecutor.AlreadyRegistered.selector);
        executor.registerExecution(
            POLL_ID, address(tally), address(target), abi.encodeCall(MockTarget.setValue, (99)), DELAY, QUORUM
        );
    }

    /* ── 3. registerExecution delayTooShort reverts ──────────────── */

    function test_registerExecution_delayTooShort_reverts() public {
        vm.prank(creator);
        vm.expectRevert(TimelockExecutor.DelayTooShort.selector);
        executor.registerExecution(
            POLL_ID, address(tally), address(target), abi.encodeCall(MockTarget.setValue, (42)), 1800, QUORUM
        );
    }

    /* ── 4. schedule success ─────────────────────────────────────── */

    function test_schedule_success() public {
        _register(POLL_ID);
        _setTallyPassed();

        executor.schedule(POLL_ID);

        (,,,,,, uint256 scheduledAt, TimelockExecutor.ExecutionState s) = executor.getExecution(POLL_ID);
        assertEq(uint8(s), uint8(TimelockExecutor.ExecutionState.Scheduled));
        assertEq(scheduledAt, block.timestamp);
    }

    /* ── 5. schedule tallyNotVerified reverts ────────────────────── */

    function test_schedule_tallyNotVerified_reverts() public {
        _register(POLL_ID);
        tally.setTallyVerified(false);
        tally.setForVotes(100);
        tally.setAgainstVotes(50);
        tally.setTotalVoters(10);

        vm.expectRevert(TimelockExecutor.TallyNotVerified.selector);
        executor.schedule(POLL_ID);
    }

    /* ── 6. schedule voteNotPassed reverts ───────────────────────── */

    function test_schedule_voteNotPassed_reverts() public {
        _register(POLL_ID);
        tally.setTallyVerified(true);
        tally.setForVotes(40);
        tally.setAgainstVotes(60);
        tally.setTotalVoters(10);

        vm.expectRevert(TimelockExecutor.VoteNotPassed.selector);
        executor.schedule(POLL_ID);
    }

    /* ── 7. schedule quorumNotMet reverts ────────────────────────── */

    function test_schedule_quorumNotMet_reverts() public {
        _register(POLL_ID);
        tally.setTallyVerified(true);
        tally.setForVotes(100);
        tally.setAgainstVotes(50);
        tally.setTotalVoters(3); // quorum is 5

        vm.expectRevert(TimelockExecutor.QuorumNotMet.selector);
        executor.schedule(POLL_ID);
    }

    /* ── 8. schedule alreadyScheduled reverts ────────────────────── */

    function test_schedule_alreadyScheduled_reverts() public {
        _register(POLL_ID);
        _setTallyPassed();
        executor.schedule(POLL_ID);

        vm.expectRevert(TimelockExecutor.NotRegistered.selector);
        executor.schedule(POLL_ID);
    }

    /* ── 9. execute success ──────────────────────────────────────── */

    function test_execute_success() public {
        _register(POLL_ID);
        _setTallyPassed();
        executor.schedule(POLL_ID);

        vm.warp(block.timestamp + DELAY);

        executor.execute(POLL_ID);

        assertEq(target.value(), 42);
        assertEq(uint8(executor.getState(POLL_ID)), uint8(TimelockExecutor.ExecutionState.Executed));
    }

    /* ── 10. execute timelockNotExpired reverts ───────────────────── */

    function test_execute_timelockNotExpired_reverts() public {
        _register(POLL_ID);
        _setTallyPassed();
        executor.schedule(POLL_ID);

        vm.warp(block.timestamp + DELAY - 1);

        vm.expectRevert(TimelockExecutor.TimelockNotExpired.selector);
        executor.execute(POLL_ID);
    }

    /* ── 11. execute notScheduled reverts ─────────────────────────── */

    function test_execute_notScheduled_reverts() public {
        _register(POLL_ID);

        vm.expectRevert(TimelockExecutor.NotScheduled.selector);
        executor.execute(POLL_ID);
    }

    /* ── 12. cancel by creator ───────────────────────────────────── */

    function test_cancel_byCreator() public {
        _register(POLL_ID);

        vm.prank(creator);
        executor.cancel(POLL_ID);

        assertEq(uint8(executor.getState(POLL_ID)), uint8(TimelockExecutor.ExecutionState.Cancelled));
    }

    /* ── 13. cancel by MACI owner ────────────────────────────────── */

    function test_cancel_byMaciOwner() public {
        _register(POLL_ID);

        vm.prank(maciOwner);
        executor.cancel(POLL_ID);

        assertEq(uint8(executor.getState(POLL_ID)), uint8(TimelockExecutor.ExecutionState.Cancelled));
    }

    /* ── 14. cancel by non-owner reverts ─────────────────────────── */

    function test_cancel_byNonOwner_reverts() public {
        _register(POLL_ID);

        vm.prank(nonOwner);
        vm.expectRevert(TimelockExecutor.NotCreatorOrOwner.selector);
        executor.cancel(POLL_ID);
    }

    /* ── 15. cancel alreadyExecuted reverts ──────────────────────── */

    function test_cancel_alreadyExecuted_reverts() public {
        _register(POLL_ID);
        _setTallyPassed();
        executor.schedule(POLL_ID);
        vm.warp(block.timestamp + DELAY);
        executor.execute(POLL_ID);

        vm.prank(creator);
        vm.expectRevert(TimelockExecutor.AlreadyExecuted.selector);
        executor.cancel(POLL_ID);
    }

    /* ── 16. getState returns correct states ─────────────────────── */

    function test_getState_returnsCorrectStates() public {
        // None
        assertEq(uint8(executor.getState(999)), uint8(TimelockExecutor.ExecutionState.None));

        // Registered
        _register(POLL_ID);
        assertEq(uint8(executor.getState(POLL_ID)), uint8(TimelockExecutor.ExecutionState.Registered));

        // Scheduled
        _setTallyPassed();
        executor.schedule(POLL_ID);
        assertEq(uint8(executor.getState(POLL_ID)), uint8(TimelockExecutor.ExecutionState.Scheduled));

        // Executed
        vm.warp(block.timestamp + DELAY);
        executor.execute(POLL_ID);
        assertEq(uint8(executor.getState(POLL_ID)), uint8(TimelockExecutor.ExecutionState.Executed));

        // Cancelled (use a different pollId)
        _register(2);
        vm.prank(creator);
        executor.cancel(2);
        assertEq(uint8(executor.getState(2)), uint8(TimelockExecutor.ExecutionState.Cancelled));
    }
}
