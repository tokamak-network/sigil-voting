// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/governance/DelegationRegistry.sol";
import "../contracts/voiceCreditProxy/DelegatingVoiceCreditProxy.sol";
import "../contracts/governance/TimelockExecutor.sol";

/// @title DeployGovernance - Deploy governance contracts (DelegationRegistry, DelegatingVoiceCreditProxy, TimelockExecutor)
/// @notice Usage:
///   TOKEN_ADDRESS=0x... forge script script/DeployGovernance.s.sol --rpc-url sepolia --broadcast
///   (optional) MACI_ADDRESS=0x... to deploy TimelockExecutor in the same run
contract DeployGovernanceScript is Script {
    function run() external {
        address token = vm.envAddress("TOKEN_ADDRESS");
        address maciAddr = vm.envOr("MACI_ADDRESS", address(0));
        address timelockExecutorAddress = address(0);

        vm.startBroadcast();

        // 1. Deploy DelegationRegistry
        DelegationRegistry delegationRegistry = new DelegationRegistry();
        console.log("DelegationRegistry:", address(delegationRegistry));

        // 2. Deploy DelegatingVoiceCreditProxy(token, delegationRegistry)
        DelegatingVoiceCreditProxy voiceCreditProxy = new DelegatingVoiceCreditProxy(token, address(delegationRegistry));
        console.log("DelegatingVoiceCreditProxy:", address(voiceCreditProxy));

        // 3. Deploy TimelockExecutor(maciAddress) (optional)
        if (maciAddr != address(0)) {
            TimelockExecutor timelockExecutor = new TimelockExecutor(maciAddr);
            timelockExecutorAddress = address(timelockExecutor);
            console.log("TimelockExecutor:", timelockExecutorAddress);
        } else {
            console.log("TimelockExecutor: skipped (MACI_ADDRESS not set)");
        }

        vm.stopBroadcast();

        console.log("\n=== Governance Deployment Complete ===");
        console.log("  DelegationRegistry:", address(delegationRegistry));
        console.log("  DelegatingVoiceCreditProxy:", address(voiceCreditProxy));
        if (timelockExecutorAddress != address(0)) {
            console.log("  TimelockExecutor:", timelockExecutorAddress);
        } else {
            console.log("  TimelockExecutor: skipped");
        }
        console.log("  Token:", token);
        if (maciAddr != address(0)) {
            console.log("  MACI:", maciAddr);
        } else {
            console.log("  MACI: (not set)");
        }
    }
}
