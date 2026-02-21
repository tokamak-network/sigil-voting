// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TimelockExecutor - Execute on-chain actions after vote approval + timelock
/// @notice Registers execution targets per poll, schedules after tally verification, executes after delay
contract TimelockExecutor {
    enum ExecutionState {
        None,
        Registered,
        Scheduled,
        Executed,
        Cancelled
    }

    struct Execution {
        address creator;
        address tallyAddr;
        address target;
        bytes callData;
        uint256 timelockDelay;
        uint256 quorum;
        uint256 scheduledAt;
        ExecutionState state;
    }

    address public immutable maci;
    uint256 public constant MIN_DELAY = 3600; // 1 hour

    mapping(uint256 => Execution) private _executions;

    event ExecutionRegistered(uint256 indexed pollId, address target, uint256 delay, uint256 quorum);
    event ExecutionScheduled(uint256 indexed pollId, uint256 scheduledAt);
    event ExecutionExecuted(uint256 indexed pollId, bytes returnData);
    event ExecutionCancelled(uint256 indexed pollId);

    error AlreadyRegistered();
    error DelayTooShort();
    error NotRegistered();
    error NotScheduled();
    error TallyNotVerified();
    error VoteNotPassed();
    error QuorumNotMet();
    error AlreadyScheduled();
    error TimelockNotExpired();
    error AlreadyExecuted();
    error NotCreatorOrOwner();
    error ExecutionFailed();
    error InvalidState();

    constructor(address _maci) {
        maci = _maci;
    }

    /// @notice Register an execution target for a poll
    function registerExecution(
        uint256 pollId,
        address tallyAddr,
        address target,
        bytes calldata callData,
        uint256 delay,
        uint256 quorum
    ) external {
        if (_executions[pollId].state != ExecutionState.None) revert AlreadyRegistered();
        if (delay < MIN_DELAY) revert DelayTooShort();

        _executions[pollId] = Execution({
            creator: msg.sender,
            tallyAddr: tallyAddr,
            target: target,
            callData: callData,
            timelockDelay: delay,
            quorum: quorum,
            scheduledAt: 0,
            state: ExecutionState.Registered
        });

        emit ExecutionRegistered(pollId, target, delay, quorum);
    }

    /// @notice Schedule execution after tally is verified and vote passed
    function schedule(uint256 pollId) external {
        Execution storage exec = _executions[pollId];
        if (exec.state != ExecutionState.Registered) revert NotRegistered();

        // Check tally is verified
        (bool ok1, bytes memory d1) = exec.tallyAddr.staticcall(abi.encodeWithSignature("tallyVerified()"));
        if (!ok1 || !abi.decode(d1, (bool))) revert TallyNotVerified();

        // Check forVotes > againstVotes
        (bool ok2, bytes memory d2) = exec.tallyAddr.staticcall(abi.encodeWithSignature("forVotes()"));
        (bool ok3, bytes memory d3) = exec.tallyAddr.staticcall(abi.encodeWithSignature("againstVotes()"));
        if (!ok2 || !ok3) revert TallyNotVerified();
        uint256 forV = abi.decode(d2, (uint256));
        uint256 againstV = abi.decode(d3, (uint256));
        if (forV <= againstV) revert VoteNotPassed();

        // Check quorum
        (bool ok4, bytes memory d4) = exec.tallyAddr.staticcall(abi.encodeWithSignature("totalVoters()"));
        if (!ok4) revert TallyNotVerified();
        uint256 voters = abi.decode(d4, (uint256));
        if (voters < exec.quorum) revert QuorumNotMet();

        exec.scheduledAt = block.timestamp;
        exec.state = ExecutionState.Scheduled;

        emit ExecutionScheduled(pollId, block.timestamp);
    }

    /// @notice Execute after timelock has expired
    function execute(uint256 pollId) external {
        Execution storage exec = _executions[pollId];
        if (exec.state != ExecutionState.Scheduled) revert NotScheduled();
        if (block.timestamp < exec.scheduledAt + exec.timelockDelay) revert TimelockNotExpired();

        exec.state = ExecutionState.Executed;

        (bool success, bytes memory returnData) = exec.target.call(exec.callData);
        if (!success) revert ExecutionFailed();

        emit ExecutionExecuted(pollId, returnData);
    }

    /// @notice Cancel execution (creator or MACI owner only)
    function cancel(uint256 pollId) external {
        Execution storage exec = _executions[pollId];
        if (exec.state == ExecutionState.None) revert NotRegistered();
        if (exec.state == ExecutionState.Executed) revert AlreadyExecuted();
        if (exec.state == ExecutionState.Cancelled) revert InvalidState();

        // Check: must be creator or MACI owner
        (bool ok, bytes memory data) = maci.staticcall(abi.encodeWithSignature("owner()"));
        address maciOwner = ok ? abi.decode(data, (address)) : address(0);
        if (msg.sender != exec.creator && msg.sender != maciOwner) revert NotCreatorOrOwner();

        exec.state = ExecutionState.Cancelled;

        emit ExecutionCancelled(pollId);
    }

    /// @notice Get execution info for a poll
    function getExecution(uint256 pollId)
        external
        view
        returns (
            address creator,
            address tallyAddr,
            address target,
            bytes memory callData,
            uint256 timelockDelay,
            uint256 quorum,
            uint256 scheduledAt,
            ExecutionState state
        )
    {
        Execution storage exec = _executions[pollId];
        return (
            exec.creator,
            exec.tallyAddr,
            exec.target,
            exec.callData,
            exec.timelockDelay,
            exec.quorum,
            exec.scheduledAt,
            exec.state
        );
    }

    /// @notice Get current state of an execution
    function getState(uint256 pollId) external view returns (ExecutionState) {
        return _executions[pollId].state;
    }

    /// @notice Check if a poll can be scheduled
    function canSchedule(uint256 pollId) external view returns (bool) {
        Execution storage exec = _executions[pollId];
        if (exec.state != ExecutionState.Registered) return false;

        (bool ok1, bytes memory d1) = exec.tallyAddr.staticcall(abi.encodeWithSignature("tallyVerified()"));
        if (!ok1 || !abi.decode(d1, (bool))) return false;

        (bool ok2, bytes memory d2) = exec.tallyAddr.staticcall(abi.encodeWithSignature("forVotes()"));
        (bool ok3, bytes memory d3) = exec.tallyAddr.staticcall(abi.encodeWithSignature("againstVotes()"));
        if (!ok2 || !ok3) return false;
        if (abi.decode(d2, (uint256)) <= abi.decode(d3, (uint256))) return false;

        (bool ok4, bytes memory d4) = exec.tallyAddr.staticcall(abi.encodeWithSignature("totalVoters()"));
        if (!ok4) return false;
        if (abi.decode(d4, (uint256)) < exec.quorum) return false;

        return true;
    }

    /// @notice Check if a poll can be executed
    function canExecute(uint256 pollId) external view returns (bool) {
        Execution storage exec = _executions[pollId];
        if (exec.state != ExecutionState.Scheduled) return false;
        return block.timestamp >= exec.scheduledAt + exec.timelockDelay;
    }
}
