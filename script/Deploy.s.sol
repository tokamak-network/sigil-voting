// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/Groth16Verifier.sol";
import "../contracts/PrivateVoting.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Groth16 Verifier
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Groth16Verifier deployed at:", address(verifier));

        // 2. Deploy PrivateVoting with verifier address
        PrivateVoting privateVoting = new PrivateVoting(address(verifier));
        console.log("PrivateVoting deployed at:", address(privateVoting));

        vm.stopBroadcast();

        // Output for easy copy-paste
        console.log("\n=== Update src/contract.ts ===");
        console.log("PRIVATE_VOTING_ADDRESS:", address(privateVoting));
        console.log("VERIFIER_ADDRESS:", address(verifier));
    }
}
