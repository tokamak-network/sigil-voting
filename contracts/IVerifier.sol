// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IVerifier - Interface for Groth16 proof verification
interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[] calldata _pubSignals
    ) external view returns (bool);
}
