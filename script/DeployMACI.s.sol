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
    address constant MSG_PROCESSOR_VERIFIER = 0x352522b121Ac377f39AaD59De6D5C07C43Af5D59;
    address constant TALLY_VERIFIER = 0xF1ecb18a649cf7060f746Cc155638992E83f1DD7;
    address constant VK_REGISTRY = 0xCCcE4703D53fc112057C8fF4F1bC397C7F68732b;

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

        console.log("\n=== MACI V9 Deployment (Security Hardening) ===");
        console.log("  maci:", address(maci));
        console.log("  stateAq:", address(stateAq));
        console.log("  Reused: gatekeeper, voiceCreditProxy, verifiers, vkRegistry");
    }
}
