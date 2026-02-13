// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DomainObjs - Shared constants and domain objects for MACI
/// @notice Contains SNARK field size and blank state leaf hash
contract DomainObjs {
    /// @notice The SNARK scalar field size
    uint256 internal constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @notice Blank state leaf hash (index 0)
    /// @dev Fixed value derived from Pedersen generator point hash.
    ///      This is the default value for empty/invalid state leaves.
    ///      Any invalid message in the circuit routes to this index 0 leaf.
    uint256 internal constant BLANK_STATE_LEAF_HASH =
        6769006970205099520508948723718471474639489531891261765984497002137765687014;

    /// @notice Nothing-up-my-sleeve value for empty tree leaves
    uint256 internal constant NOTHING_UP_MY_SLEEVE =
        8370432830353022751713833565135785980866757267633941821328460903436894336785;
}
