#!/bin/bash

# D2 Quadratic Voting Circuit Compilation Script
# Prerequisites: circom, snarkjs installed

set -e

CIRCUIT_NAME="D2_QuadraticVoting"
PTAU_FILE="powersOfTau28_hez_final_17.ptau"
BUILD_DIR="./build_d2"

echo "=== D2 Quadratic Voting Circuit Compilation ==="

# Create build directory
mkdir -p $BUILD_DIR

# Step 1: Download Powers of Tau (if not exists)
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading Powers of Tau..."
    curl -L -o $PTAU_FILE https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_17.ptau
fi

# Step 2: Compile circuit
echo "Compiling circuit..."
circom ${CIRCUIT_NAME}.circom --r1cs --wasm --sym -o $BUILD_DIR

# Step 3: Setup ceremony (Groth16)
echo "Running trusted setup..."
snarkjs groth16 setup $BUILD_DIR/${CIRCUIT_NAME}.r1cs $PTAU_FILE $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey

# Step 4: Contribute to ceremony
echo "Contributing to ceremony..."
snarkjs zkey contribute $BUILD_DIR/${CIRCUIT_NAME}_0000.zkey $BUILD_DIR/${CIRCUIT_NAME}_final.zkey --name="D2 Quadratic Voting" -v

# Step 5: Export verification key
echo "Exporting verification key..."
snarkjs zkey export verificationkey $BUILD_DIR/${CIRCUIT_NAME}_final.zkey $BUILD_DIR/verification_key_d2.json

# Step 6: Generate Solidity verifier
echo "Generating Solidity verifier..."
snarkjs zkey export solidityverifier $BUILD_DIR/${CIRCUIT_NAME}_final.zkey $BUILD_DIR/Groth16VerifierD2.sol

echo "=== D2 Compilation Complete ==="
echo "Files generated in $BUILD_DIR:"
echo "  - ${CIRCUIT_NAME}.r1cs"
echo "  - ${CIRCUIT_NAME}_js/"
echo "  - ${CIRCUIT_NAME}_final.zkey"
echo "  - verification_key_d2.json"
echo "  - Groth16VerifierD2.sol"
