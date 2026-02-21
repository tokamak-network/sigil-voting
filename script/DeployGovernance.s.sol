// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/governance/DelegationRegistry.sol";
import "../contracts/voiceCreditProxy/DelegatingVoiceCreditProxy.sol";
import "../contracts/governance/TimelockExecutor.sol";

/// @title DeployGovernance - Deploy governance contracts (DelegationRegistry, DelegatingVoiceCreditProxy, TimelockExecutor)
/// @notice Usage:
///   TOKEN_ADDRESS=0x... MACI_ADDRESS=0x... forge script script/DeployGovernance.s.sol --rpc-url sepolia --broadcast
contract DeployGovernanceScript is Script {
    function run() external {
        address token = vm.envAddress("TOKEN_ADDRESS");
        address maciAddr = vm.envAddress("MACI_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy DelegationRegistry
        DelegationRegistry delegationRegistry = new DelegationRegistry();
        console.log("DelegationRegistry:", address(delegationRegistry));

        // 2. Deploy DelegatingVoiceCreditProxy(token, delegationRegistry)
        DelegatingVoiceCreditProxy voiceCreditProxy = new DelegatingVoiceCreditProxy(token, address(delegationRegistry));
        console.log("DelegatingVoiceCreditProxy:", address(voiceCreditProxy));

        // 3. Deploy TimelockExecutor(maciAddress)
        TimelockExecutor timelockExecutor = new TimelockExecutor(maciAddr);
        console.log("TimelockExecutor:", address(timelockExecutor));

        vm.stopBroadcast();

        console.log("\n=== Governance Deployment Complete ===");
        console.log("  DelegationRegistry:", address(delegationRegistry));
        console.log("  DelegatingVoiceCreditProxy:", address(voiceCreditProxy));
        console.log("  TimelockExecutor:", address(timelockExecutor));
        console.log("  Token:", token);
        console.log("  MACI:", maciAddr);
    }
}
