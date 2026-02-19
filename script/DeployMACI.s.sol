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
    // Already deployed on Sepolia (reuse across versions)
    address constant GATEKEEPER = 0x4c18984A78910Dd1976d6DFd820f6d18e7edD672;
    address constant VOICE_CREDIT_PROXY = 0x03669FF296a2B2CCF851bE98dbEa4BB2633ecF00;
    address constant MSG_PROCESSOR_VERIFIER = 0x47221B605bF18E92296850191A0c899fe03A27dB;
    address constant TALLY_VERIFIER = 0xa48c2bD789EAd236fFEE36dEad220DFFE3feccF1;
    address constant VK_REGISTRY = 0xC8f6e6AB628CC73aDa2c01054C4772ACA222852C;

    function run() external {
        vm.startBroadcast();

        // Fresh AccQueue (previous one is already-merged, can't be reused)
        AccQueue stateAq = new AccQueue(5, 2);
        console.log("AccQueue:", address(stateAq));

        // Fresh MACI with security hardening
        MACI maci = new MACI(GATEKEEPER, VOICE_CREDIT_PROXY, 2, address(stateAq));
        console.log("MACI:", address(maci));

        // Transfer AccQueue ownership to MACI, then initialize
        stateAq.transferOwnership(address(maci));
        maci.init();

        vm.stopBroadcast();

        console.log("\n=== MACI V5 Deployment (Fixed Poll.sol) ===");
        console.log("  maci:", address(maci));
        console.log("  stateAq:", address(stateAq));
        console.log("  Reused: gatekeeper, voiceCreditProxy, verifiers, vkRegistry");
    }
}
