#!/bin/bash
# MACI Circuit Compilation + Trusted Setup
#
# Compiles MessageProcessor and TallyVotes circuits, then runs
# Groth16 trusted setup with snarkjs.
#
# Usage:
#   ./compile_maci.sh          # Development params (small, fast)
#   ./compile_maci.sh prod     # Production params (large, slow)
#
# Requirements:
#   - circom >= 2.1.6
#   - snarkjs (via npx)
#   - pot15_final.ptau in build/ (dev) or powersOfTau28_hez_final_20.ptau (prod)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-dev}"
BUILD_DIR="build_maci"
PTAU_FILE="build/pot18_final.ptau"

echo "============================================"
echo "  MACI Circuit Compilation ($MODE mode)"
echo "============================================"

# Create build directory
mkdir -p "$BUILD_DIR"

# ============ 1. Compile Circuits ============

echo ""
echo "[1/6] Compiling MessageProcessor..."
circom MessageProcessor.circom \
  --r1cs --wasm --sym \
  -l node_modules \
  -o "$BUILD_DIR" \
  2>&1

echo ""
echo "[2/6] Compiling TallyVotes..."
circom TallyVotes.circom \
  --r1cs --wasm --sym \
  -l node_modules \
  -o "$BUILD_DIR" \
  2>&1

# Print circuit info
echo ""
echo "--- Circuit Stats ---"
npx snarkjs r1cs info "$BUILD_DIR/MessageProcessor.r1cs" 2>&1
npx snarkjs r1cs info "$BUILD_DIR/TallyVotes.r1cs" 2>&1

# ============ 2. Groth16 Trusted Setup ============

echo ""
echo "[3/6] Groth16 setup: MessageProcessor..."
npx snarkjs groth16 setup \
  "$BUILD_DIR/MessageProcessor.r1cs" \
  "$PTAU_FILE" \
  "$BUILD_DIR/MessageProcessor_0000.zkey" \
  2>&1

echo ""
echo "[4/6] Groth16 setup: TallyVotes..."
npx snarkjs groth16 setup \
  "$BUILD_DIR/TallyVotes.r1cs" \
  "$PTAU_FILE" \
  "$BUILD_DIR/TallyVotes_0000.zkey" \
  2>&1

# ============ 3. Contribute (dev: single contribution) ============

echo ""
echo "[5/6] Contributing to ceremony..."

npx snarkjs zkey contribute \
  "$BUILD_DIR/MessageProcessor_0000.zkey" \
  "$BUILD_DIR/MessageProcessor_final.zkey" \
  --name="dev-contributor" \
  -e="$(head -c 32 /dev/urandom | xxd -p)" \
  2>&1

npx snarkjs zkey contribute \
  "$BUILD_DIR/TallyVotes_0000.zkey" \
  "$BUILD_DIR/TallyVotes_final.zkey" \
  --name="dev-contributor" \
  -e="$(head -c 32 /dev/urandom | xxd -p)" \
  2>&1

# ============ 4. Export Verification Keys ============

echo ""
echo "[6/6] Exporting verification keys..."

npx snarkjs zkey export verificationkey \
  "$BUILD_DIR/MessageProcessor_final.zkey" \
  "$BUILD_DIR/MessageProcessor_verification_key.json" \
  2>&1

npx snarkjs zkey export verificationkey \
  "$BUILD_DIR/TallyVotes_final.zkey" \
  "$BUILD_DIR/TallyVotes_verification_key.json" \
  2>&1

# ============ 5. Export Solidity Verifiers ============

echo ""
echo "Exporting Solidity verifiers..."

npx snarkjs zkey export solidityverifier \
  "$BUILD_DIR/MessageProcessor_final.zkey" \
  "$BUILD_DIR/Groth16VerifierMsgProcessor.sol" \
  2>&1

npx snarkjs zkey export solidityverifier \
  "$BUILD_DIR/TallyVotes_final.zkey" \
  "$BUILD_DIR/Groth16VerifierTally.sol" \
  2>&1

# ============ Done ============

echo ""
echo "============================================"
echo "  Compilation Complete!"
echo "============================================"
echo ""
echo "Build artifacts in: $BUILD_DIR/"
echo ""
echo "  MessageProcessor:"
echo "    .wasm:  ${BUILD_DIR}/MessageProcessor_js/MessageProcessor.wasm"
echo "    .r1cs:  ${BUILD_DIR}/MessageProcessor.r1cs"
echo "    .zkey:  ${BUILD_DIR}/MessageProcessor_final.zkey"
echo "    .vkey:  ${BUILD_DIR}/MessageProcessor_verification_key.json"
echo "    .sol:   ${BUILD_DIR}/Groth16VerifierMsgProcessor.sol"
echo ""
echo "  TallyVotes:"
echo "    .wasm:  ${BUILD_DIR}/TallyVotes_js/TallyVotes.wasm"
echo "    .r1cs:  ${BUILD_DIR}/TallyVotes.r1cs"
echo "    .zkey:  ${BUILD_DIR}/TallyVotes_final.zkey"
echo "    .vkey:  ${BUILD_DIR}/TallyVotes_verification_key.json"
echo "    .sol:   ${BUILD_DIR}/Groth16VerifierTally.sol"
echo ""
echo "Next steps:"
echo "  1. Copy .sol files to contracts/"
echo "  2. Verify: npx snarkjs groth16 verify <vkey> <public> <proof>"
echo "  3. For production: re-run with 'prod' flag and multi-party ceremony"
