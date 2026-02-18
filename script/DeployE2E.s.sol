// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/AccQueue.sol";
import "../contracts/MACI.sol";
import "../contracts/Groth16VerifierMsgProcessor.sol";
import "../contracts/Groth16VerifierTally.sol";

/// @notice Deploy fresh Verifiers + AccQueue + MACI for E2E testing
contract DeployE2EScript is Script {
    // Reuse from existing deployment
    address constant GATEKEEPER = 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672;
    address constant VOICE_CREDIT_PROXY = 0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00;
    address constant VK_REGISTRY = 0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C;

    function run() external {
        vm.startBroadcast();

        Groth16VerifierMsgProcessor mpVerifier = new Groth16VerifierMsgProcessor();
        Groth16VerifierTally tallyVerifier = new Groth16VerifierTally();
        AccQueue stateAq = new AccQueue(5, 2);
        MACI maci = new MACI(GATEKEEPER, address(VOICE_CREDIT_PROXY), 2, address(stateAq));

        vm.stopBroadcast();

        // Output in parseable format for E2E script
        console.log("E2E_MP_VERIFIER=%s", address(mpVerifier));
        console.log("E2E_TALLY_VERIFIER=%s", address(tallyVerifier));
        console.log("E2E_ACCQUEUE=%s", address(stateAq));
        console.log("E2E_MACI=%s", address(maci));
        console.log("E2E_VK_REGISTRY=%s", VK_REGISTRY);
    }
}
