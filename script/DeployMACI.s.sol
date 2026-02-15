// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/gatekeepers/FreeForAllGatekeeper.sol";
import "../contracts/voiceCreditProxy/ConstantVoiceCreditProxy.sol";
import "../contracts/Groth16VerifierMsgProcessor.sol";
import "../contracts/Groth16VerifierTally.sol";
import "../contracts/VkRegistry.sol";
import "../contracts/AccQueue.sol";
import "../contracts/MACI.sol";

contract DeployMACIScript is Script {
    // Already deployed on Sepolia (from previous broadcast)
    address constant GATEKEEPER = 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672;
    address constant VOICE_CREDIT_PROXY = 0x800D89970c9644619566FEcdA79Ff27110af0cDf;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy real Groth16 verifiers (replacing MockVerifier)
        Groth16VerifierMsgProcessor msgProcessorVerifier = new Groth16VerifierMsgProcessor();
        console.log("MsgProcessorVerifier:", address(msgProcessorVerifier));

        Groth16VerifierTally tallyVerifier = new Groth16VerifierTally();
        console.log("TallyVerifier:", address(tallyVerifier));

        // 2. VkRegistry
        VkRegistry vkRegistry = new VkRegistry();
        console.log("VkRegistry:", address(vkRegistry));

        // 3. AccQueue (deployed separately to avoid block gas limit)
        AccQueue stateAq = new AccQueue(5, 2);
        console.log("AccQueue:", address(stateAq));

        // 4. MACI (stateTreeDepth = 10, with pre-deployed AccQueue)
        MACI maci = new MACI(GATEKEEPER, VOICE_CREDIT_PROXY, 10, address(stateAq));
        console.log("MACI:", address(maci));

        vm.stopBroadcast();

        console.log("\n=== MACI V2 Deployment Complete (Real Verifiers) ===");
        console.log("  gatekeeper:", GATEKEEPER);
        console.log("  voiceCreditProxy:", VOICE_CREDIT_PROXY);
        console.log("  msgProcessorVerifier:", address(msgProcessorVerifier));
        console.log("  tallyVerifier:", address(tallyVerifier));
        console.log("  vkRegistry:", address(vkRegistry));
        console.log("  maci:", address(maci));
        console.log("\nNote: When calling maci.deployPoll(), pass msgProcessorVerifier address.");
        console.log("      MessageProcessor and Tally use SEPARATE verifiers.");
        console.log("      For now, both use msgProcessorVerifier (single verifier per poll).");
        console.log("      Future: split into per-contract verifier addresses.");
    }
}
