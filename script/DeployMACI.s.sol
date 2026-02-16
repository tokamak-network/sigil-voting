// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/gatekeepers/FreeForAllGatekeeper.sol";
import "../contracts/voiceCreditProxy/ERC20VoiceCreditProxy.sol";
import "../contracts/Groth16VerifierMsgProcessor.sol";
import "../contracts/Groth16VerifierTally.sol";
import "../contracts/VkRegistry.sol";
import "../contracts/AccQueue.sol";
import "../contracts/MACI.sol";

contract DeployMACIScript is Script {
    // Already deployed on Sepolia (reuse)
    address constant GATEKEEPER = 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672;

    // TON Token on Sepolia (voice credits = token balance)
    address constant TON_TOKEN = 0xa30fe40285B8f5c0457DbC3B7C8A280373c40044;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy ERC20 voice credit proxy (credits = TON balance)
        ERC20VoiceCreditProxy voiceCreditProxy = new ERC20VoiceCreditProxy(TON_TOKEN);
        console.log("ERC20VoiceCreditProxy:", address(voiceCreditProxy));

        // 2. Deploy real Groth16 verifiers
        Groth16VerifierMsgProcessor msgProcessorVerifier = new Groth16VerifierMsgProcessor();
        console.log("MsgProcessorVerifier:", address(msgProcessorVerifier));

        Groth16VerifierTally tallyVerifier = new Groth16VerifierTally();
        console.log("TallyVerifier:", address(tallyVerifier));

        // 3. VkRegistry
        VkRegistry vkRegistry = new VkRegistry();
        console.log("VkRegistry:", address(vkRegistry));

        // 4. AccQueue (deployed separately to avoid block gas limit)
        AccQueue stateAq = new AccQueue(5, 2);
        console.log("AccQueue:", address(stateAq));

        // 5. MACI (stateTreeDepth = 10, ERC20 voice credits)
        MACI maci = new MACI(GATEKEEPER, address(voiceCreditProxy), 10, address(stateAq));
        console.log("MACI:", address(maci));

        vm.stopBroadcast();

        console.log("\n=== MACI V2 Deployment Complete (ERC20 Voice Credits) ===");
        console.log("  token:", TON_TOKEN);
        console.log("  gatekeeper:", GATEKEEPER);
        console.log("  voiceCreditProxy:", address(voiceCreditProxy));
        console.log("  msgProcessorVerifier:", address(msgProcessorVerifier));
        console.log("  tallyVerifier:", address(tallyVerifier));
        console.log("  vkRegistry:", address(vkRegistry));
        console.log("  maci:", address(maci));
    }
}
