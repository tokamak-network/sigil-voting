// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/AccQueue.sol";
import "../contracts/MACI.sol";
import "../contracts/VkRegistry.sol";
import "../contracts/Groth16VerifierMsgProcessor.sol";
import "../contracts/Groth16VerifierTally.sol";

/// @notice Deploy fresh Verifiers + VkRegistry + AccQueue + MACI
/// @dev V9: Soft EdDSA circuit (handles invalid signatures gracefully)
contract DeployE2EScript is Script {
    // Reuse from existing deployment
    address constant GATEKEEPER = 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672;
    address constant VOICE_CREDIT_PROXY = 0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy new MsgProcessor verifier (soft EdDSA circuit)
        Groth16VerifierMsgProcessor mpVerifier = new Groth16VerifierMsgProcessor();

        // 2. Deploy new Tally verifier (unchanged circuit, but fresh deploy)
        Groth16VerifierTally tallyVerifier = new Groth16VerifierTally();

        // 3. Deploy new VkRegistry and register VKs
        VkRegistry vkRegistry = new VkRegistry();

        // 4. Fresh AccQueue + MACI
        AccQueue stateAq = new AccQueue(5, 2);
        MACI maci = new MACI(GATEKEEPER, VOICE_CREDIT_PROXY, 2, address(stateAq));

        // 5. Transfer AccQueue ownership to MACI + initialize
        stateAq.transferOwnership(address(maci));
        maci.init();

        vm.stopBroadcast();

        // Output
        console.log("\n=== MACI V9 Deployment (Soft EdDSA Circuit) ===");
        console.log("  MsgProcessorVerifier:", address(mpVerifier));
        console.log("  TallyVerifier:", address(tallyVerifier));
        console.log("  VkRegistry:", address(vkRegistry));
        console.log("  AccQueue:", address(stateAq));
        console.log("  MACI:", address(maci));
        console.log("  Reused: Gatekeeper, VoiceCreditProxy(ERC20)");
    }
}
