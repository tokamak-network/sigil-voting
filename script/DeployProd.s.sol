// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/gatekeepers/FreeForAllGatekeeper.sol";
import "../contracts/voiceCreditProxy/ERC20VoiceCreditProxy.sol";
import "../contracts/Groth16VerifierMsgProcessorProd.sol";
import "../contracts/Groth16VerifierTallyProd.sol";
import "../contracts/VkRegistry.sol";
import "../contracts/AccQueue.sol";
import "../contracts/MACI.sol";

/**
 * Production Deployment Script
 *
 * Deploys MACI with production circuit verifiers:
 *   MessageProcessor(4, 4, 2, 5) — 624 max voters
 *   TallyVotes(4, 2, 5) — 25 vote options
 *
 * Usage:
 *   FOUNDRY_PROFILE=deploy forge script script/DeployProd.s.sol \
 *     --rpc-url $SEPOLIA_RPC_URL \
 *     --broadcast --verify
 */
contract DeployProdScript is Script {
    // Reuse existing gatekeeper and voice credit proxy
    address constant GATEKEEPER = 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672;
    address constant VOICE_CREDIT_PROXY = 0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy production verifiers (new VK constants from depth=4 circuits)
        Groth16VerifierMsgProcessorProd mpVerifier = new Groth16VerifierMsgProcessorProd();
        console.log("MsgProcessor Verifier (prod):", address(mpVerifier));

        Groth16VerifierTallyProd tallyVerifier = new Groth16VerifierTallyProd();
        console.log("Tally Verifier (prod):", address(tallyVerifier));

        // 2. Deploy VkRegistry
        VkRegistry vkRegistry = new VkRegistry();
        console.log("VkRegistry:", address(vkRegistry));

        // 3. Fresh AccQueue (quinary, depth=4 for production)
        AccQueue stateAq = new AccQueue(5, 4);
        console.log("AccQueue (depth=4):", address(stateAq));

        // 4. Deploy MACI with production stateTreeDepth=4
        MACI maci = new MACI(GATEKEEPER, VOICE_CREDIT_PROXY, 4, address(stateAq));
        console.log("MACI (prod):", address(maci));

        // 5. Transfer AccQueue ownership and initialize
        stateAq.transferOwnership(address(maci));
        maci.init();

        vm.stopBroadcast();

        console.log("\n=== Production Deployment Complete ===");
        console.log("  Circuit params: stateTreeDepth=4, batch=5 (max 624 voters)");
        console.log("  maci:", address(maci));
        console.log("  stateAq:", address(stateAq));
        console.log("  mpVerifier:", address(mpVerifier));
        console.log("  tallyVerifier:", address(tallyVerifier));
        console.log("  vkRegistry:", address(vkRegistry));
        console.log("\nNext steps:");
        console.log("  1. Update src/config.json with new addresses");
        console.log("  2. Set CIRCUIT_MODE=prod in .env for coordinator");
        console.log(
            "  3. Deploy a poll: MACI.deployPoll(title, duration, coordPubX, coordPubY, mpVerifier, tallyVerifier, vkRegistry, 4)"
        );
    }
}
