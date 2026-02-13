// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/gatekeepers/FreeForAllGatekeeper.sol";
import "../contracts/voiceCreditProxy/ConstantVoiceCreditProxy.sol";
import "../contracts/MockVerifier.sol";
import "../contracts/VkRegistry.sol";
import "../contracts/AccQueue.sol";
import "../contracts/MACI.sol";

contract DeployMACIScript is Script {
    // Already deployed on Sepolia (from previous broadcast)
    address constant GATEKEEPER = 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672;
    address constant VOICE_CREDIT_PROXY = 0x800D89970c9644619566FEcdA79Ff27110af0cDf;
    address constant MOCK_VERIFIER = 0x9c6418596e3777930084f27C126bf752E750857b;

    function run() external {
        vm.startBroadcast();

        // 1. VkRegistry
        VkRegistry vkRegistry = new VkRegistry();
        console.log("VkRegistry:", address(vkRegistry));

        // 2. AccQueue (deployed separately to avoid block gas limit)
        AccQueue stateAq = new AccQueue(5, 2);
        console.log("AccQueue:", address(stateAq));

        // 3. MACI (stateTreeDepth = 10, with pre-deployed AccQueue)
        MACI maci = new MACI(GATEKEEPER, VOICE_CREDIT_PROXY, 10, address(stateAq));
        console.log("MACI:", address(maci));

        vm.stopBroadcast();

        console.log("\n=== MACI V2 Deployment Complete ===");
        console.log("  gatekeeper:", GATEKEEPER);
        console.log("  voiceCreditProxy:", VOICE_CREDIT_PROXY);
        console.log("  mockVerifier:", MOCK_VERIFIER);
        console.log("  vkRegistry:", address(vkRegistry));
        console.log("  maci:", address(maci));
    }
}
