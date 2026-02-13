// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "./IVerifier.sol";

/// @title MockVerifier - Always-true verifier for testing
/// @notice Used for testnet deployments without circuit trusted setup
contract MockVerifier is IVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[] calldata
    ) external pure override returns (bool) {
        return true;
    }
}
