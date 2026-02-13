// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccQueue} from "./AccQueue.sol";
import {DomainObjs} from "./DomainObjs.sol";
import {Poll} from "./Poll.sol";
import {MessageProcessor} from "./MessageProcessor.sol";
import {Tally} from "./Tally.sol";
import {ISignUpGatekeeper} from "./gatekeepers/ISignUpGatekeeper.sol";
import {IVoiceCreditProxy} from "./voiceCreditProxy/IVoiceCreditProxy.sol";
import {PoseidonT5} from "./PoseidonT5.sol";

/// @title MACI - Minimal Anti-Collusion Infrastructure
/// @notice Registration contract: signUp with EdDSA pubkey, deployPoll for voting
/// @dev No revealVote function - votes are never publicly revealed
contract MACI is DomainObjs {
    // ============ State ============
    AccQueue public stateAq;
    uint256 public numSignUps;
    uint8 public immutable stateTreeDepth;

    ISignUpGatekeeper public signUpGatekeeper;
    IVoiceCreditProxy public voiceCreditProxy;

    // ============ Poll Registry ============
    mapping(uint256 => address) public polls;
    uint256 public nextPollId;

    // ============ Events ============
    event SignUp(
        uint256 indexed stateIndex,
        uint256 indexed pubKeyX,
        uint256 pubKeyY,
        uint256 voiceCreditBalance,
        uint256 timestamp
    );

    event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr);

    // ============ Constructor ============
    constructor(address _signUpGatekeeper, address _voiceCreditProxy, uint8 _stateTreeDepth, address _stateAq) {
        signUpGatekeeper = ISignUpGatekeeper(_signUpGatekeeper);
        voiceCreditProxy = IVoiceCreditProxy(_voiceCreditProxy);
        stateTreeDepth = _stateTreeDepth;

        // Use pre-deployed AccQueue
        stateAq = AccQueue(_stateAq);

        // Index 0: blank state leaf (for invalid message routing)
        stateAq.enqueue(BLANK_STATE_LEAF_HASH);
        // numSignUps stays 0 — blank leaf doesn't count
    }

    /// @notice Register as a voter with EdDSA public key
    /// @param _pubKeyX Baby Jubjub public key X coordinate
    /// @param _pubKeyY Baby Jubjub public key Y coordinate
    /// @param _signUpGatekeeperData Data for gatekeeper verification
    /// @param _initialVoiceCreditProxyData Data for voice credit allocation
    function signUp(
        uint256 _pubKeyX,
        uint256 _pubKeyY,
        bytes memory _signUpGatekeeperData,
        bytes memory _initialVoiceCreditProxyData
    ) external {
        // 1. Gatekeeper check
        signUpGatekeeper.register(msg.sender, _signUpGatekeeperData);

        // 2. Get voice credits
        uint256 voiceCreditBalance = voiceCreditProxy.getVoiceCredits(msg.sender, _initialVoiceCreditProxyData);

        // 3. State leaf: poseidon_4([pubKeyX, pubKeyY, voiceCreditBalance, timestamp])
        uint256 stateLeaf = PoseidonT5.hash([_pubKeyX, _pubKeyY, voiceCreditBalance, block.timestamp]);

        // 4. Enqueue into State AccQueue
        stateAq.enqueue(stateLeaf);
        numSignUps++;
        uint256 stateIndex = numSignUps; // 1-based (0 = blank leaf)

        emit SignUp(stateIndex, _pubKeyX, _pubKeyY, voiceCreditBalance, block.timestamp);
    }

    /// @notice Deploy a new Poll with associated MessageProcessor and Tally
    function deployPoll(
        string calldata _title,
        uint256 _duration,
        uint256 _coordinatorPubKeyX,
        uint256 _coordinatorPubKeyY,
        address _verifier,
        address _vkRegistry,
        uint8 _messageTreeDepth
    ) external returns (uint256 pollId) {
        pollId = nextPollId++;

        Poll poll = new Poll(
            _title, _duration, _coordinatorPubKeyX, _coordinatorPubKeyY, address(stateAq), numSignUps, _messageTreeDepth
        );

        MessageProcessor mp = new MessageProcessor(address(poll), _verifier, _vkRegistry);
        Tally tally = new Tally(address(poll), address(mp), _verifier, _vkRegistry);

        polls[pollId] = address(poll);

        emit DeployPoll(pollId, address(poll), address(mp), address(tally));
    }
}
