// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/governance/TimelockExecutor.sol";

/// @title DeployTimelockExecutor - Deploy TimelockExecutor only
/// @notice Usage:
///   MACI_ADDRESS=0x... forge script script/DeployTimelockExecutor.s.sol --rpc-url sepolia --broadcast
contract DeployTimelockExecutorScript is Script {
    function run() external {
        address maciAddr = vm.envAddress("MACI_ADDRESS");

        vm.startBroadcast();

        TimelockExecutor timelockExecutor = new TimelockExecutor(maciAddr);
        console.log("TimelockExecutor:", address(timelockExecutor));

        vm.stopBroadcast();

        console.log("\n=== TimelockExecutor Deployment Complete ===");
        console.log("  TimelockExecutor:", address(timelockExecutor));
        console.log("  MACI:", maciAddr);
    }
}
