#!/bin/bash
# MACI Circuit Compilation + Trusted Setup
#
# Compiles MessageProcessor and TallyVotes circuits, then runs
# Groth16 trusted setup with snarkjs.
#
# Usage:
#   ./compile_maci.sh          # Development params (depth=2, batch=2)
#   ./compile_maci.sh prod     # Production params (depth=4, batch=5, 625 users)
#
# Dev params:
#   MessageProcessor(2, 2, 2, 2) — max 4 voters, pot18
#   TallyVotes(2, 1, 2) — 5 vote options, pot18
#
# Prod params:
#   MessageProcessor(4, 4, 2, 5) — max 624 voters, pot20
#   TallyVotes(4, 2, 5) — 25 vote options, pot20
#
# Requirements:
#   - circom >= 2.1.6
#   - snarkjs (via npx)
#   - PTAU file: pot18_final.ptau (dev) or pot20_final.ptau (prod)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-dev}"

if [ "$MODE" = "prod" ]; then
  BUILD_DIR="build_prod"
  PTAU_FILE="build/pot20_final.ptau"
  MP_CIRCOM="MessageProcessor_prod.circom"
  TV_CIRCOM="TallyVotes_prod.circom"
  MP_NAME="MessageProcessor_prod"
  TV_NAME="TallyVotes_prod"
else
  BUILD_DIR="build_maci"
  PTAU_FILE="build/pot18_final.ptau"
  MP_CIRCOM="MessageProcessor.circom"
  TV_CIRCOM="TallyVotes.circom"
  MP_NAME="MessageProcessor"
  TV_NAME="TallyVotes"
fi

echo "============================================"
echo "  MACI Circuit Compilation ($MODE mode)"
echo "============================================"

# Verify PTAU file exists
if [ ! -f "$PTAU_FILE" ]; then
  echo "ERROR: PTAU file not found: $PTAU_FILE"
  if [ "$MODE" = "prod" ]; then
    echo "Download: curl -L -o build/pot20_final.ptau https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_20.ptau"
  fi
  exit 1
fi

# Create build directory
mkdir -p "$BUILD_DIR"

# ============ 1. Compile Circuits ============

echo ""
echo "[1/6] Compiling $MP_NAME..."
circom "$MP_CIRCOM" \
  --r1cs --wasm --sym \
  -l node_modules \
  -o "$BUILD_DIR" \
  2>&1

echo ""
echo "[2/6] Compiling $TV_NAME..."
circom "$TV_CIRCOM" \
  --r1cs --wasm --sym \
  -l node_modules \
  -o "$BUILD_DIR" \
  2>&1

# Print circuit info
echo ""
echo "--- Circuit Stats ---"
npx snarkjs r1cs info "$BUILD_DIR/${MP_NAME}.r1cs" 2>&1
npx snarkjs r1cs info "$BUILD_DIR/${TV_NAME}.r1cs" 2>&1

# ============ 2. Groth16 Trusted Setup ============

echo ""
echo "[3/6] Groth16 setup: $MP_NAME..."
npx snarkjs groth16 setup \
  "$BUILD_DIR/${MP_NAME}.r1cs" \
  "$PTAU_FILE" \
  "$BUILD_DIR/${MP_NAME}_0000.zkey" \
  2>&1

echo ""
echo "[4/6] Groth16 setup: $TV_NAME..."
npx snarkjs groth16 setup \
  "$BUILD_DIR/${TV_NAME}.r1cs" \
  "$PTAU_FILE" \
  "$BUILD_DIR/${TV_NAME}_0000.zkey" \
  2>&1

# ============ 3. Contribute (single contribution for dev/initial) ============

echo ""
echo "[5/6] Contributing to ceremony..."

npx snarkjs zkey contribute \
  "$BUILD_DIR/${MP_NAME}_0000.zkey" \
  "$BUILD_DIR/${MP_NAME}_final.zkey" \
  --name="${MODE}-contributor" \
  -e="$(head -c 32 /dev/urandom | xxd -p)" \
  2>&1

npx snarkjs zkey contribute \
  "$BUILD_DIR/${TV_NAME}_0000.zkey" \
  "$BUILD_DIR/${TV_NAME}_final.zkey" \
  --name="${MODE}-contributor" \
  -e="$(head -c 32 /dev/urandom | xxd -p)" \
  2>&1

# ============ 4. Export Verification Keys ============

echo ""
echo "[6/6] Exporting verification keys..."

npx snarkjs zkey export verificationkey \
  "$BUILD_DIR/${MP_NAME}_final.zkey" \
  "$BUILD_DIR/${MP_NAME}_verification_key.json" \
  2>&1

npx snarkjs zkey export verificationkey \
  "$BUILD_DIR/${TV_NAME}_final.zkey" \
  "$BUILD_DIR/${TV_NAME}_verification_key.json" \
  2>&1

# ============ 5. Export Solidity Verifiers ============

echo ""
echo "Exporting Solidity verifiers..."

npx snarkjs zkey export solidityverifier \
  "$BUILD_DIR/${MP_NAME}_final.zkey" \
  "$BUILD_DIR/Groth16VerifierMsgProcessor.sol" \
  2>&1

npx snarkjs zkey export solidityverifier \
  "$BUILD_DIR/${TV_NAME}_final.zkey" \
  "$BUILD_DIR/Groth16VerifierTally.sol" \
  2>&1

# ============ Done ============

echo ""
echo "============================================"
echo "  Compilation Complete! ($MODE mode)"
echo "============================================"
echo ""
echo "Build artifacts in: $BUILD_DIR/"
echo ""
echo "  MessageProcessor ($MP_NAME):"
echo "    .wasm:  ${BUILD_DIR}/${MP_NAME}_js/${MP_NAME}.wasm"
echo "    .r1cs:  ${BUILD_DIR}/${MP_NAME}.r1cs"
echo "    .zkey:  ${BUILD_DIR}/${MP_NAME}_final.zkey"
echo "    .vkey:  ${BUILD_DIR}/${MP_NAME}_verification_key.json"
echo "    .sol:   ${BUILD_DIR}/Groth16VerifierMsgProcessor.sol"
echo ""
echo "  TallyVotes ($TV_NAME):"
echo "    .wasm:  ${BUILD_DIR}/${TV_NAME}_js/${TV_NAME}.wasm"
echo "    .r1cs:  ${BUILD_DIR}/${TV_NAME}.r1cs"
echo "    .zkey:  ${BUILD_DIR}/${TV_NAME}_final.zkey"
echo "    .vkey:  ${BUILD_DIR}/${TV_NAME}_verification_key.json"
echo "    .sol:   ${BUILD_DIR}/Groth16VerifierTally.sol"
echo ""
if [ "$MODE" = "prod" ]; then
  echo "Next steps:"
  echo "  1. Copy .sol verifiers to contracts/src/"
  echo "  2. Deploy new verifiers on Sepolia"
  echo "  3. Update coordinator run.ts params: STATE_TREE_DEPTH=4, BATCH_SIZE=5"
  echo "  4. Test with production circuit files"
else
  echo "Next steps:"
  echo "  1. Copy .sol files to contracts/"
  echo "  2. Verify: npx snarkjs groth16 verify <vkey> <public> <proof>"
  echo "  3. For production: ./compile_maci.sh prod"
fi
