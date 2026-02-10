// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/ZkVotingFinal.sol";

contract DeployZkVotingFinalScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Existing verifiers and TON token from config
        address verifierD1 = 0xe4E6CFD30a945990Eca672a751410252b1AA903E;
        address verifierD2 = 0xF4e9238Da28e3Fa9D8888A5D0Df078c02E5a45E4;
        address tonToken = 0xa30fe40285B8f5c0457DbC3B7C8A280373c40044;
        address treasury = 0x9f2429c483802e5A8dcF8cD6AF4e30c0479cD841;

        vm.startBroadcast(deployerPrivateKey);

        // Deploy ZkVotingFinal with existing verifiers
        ZkVotingFinal zkVoting = new ZkVotingFinal(verifierD1, verifierD2, tonToken, treasury);
        console.log("ZkVotingFinal deployed at:", address(zkVoting));

        vm.stopBroadcast();

        // Output for config update
        console.log("\n=== Update src/config.json ===");
        console.log("zkVotingFinal:", address(zkVoting));
    }
}
