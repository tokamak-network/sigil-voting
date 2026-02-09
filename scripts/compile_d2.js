#!/usr/bin/env node
/**
 * D2 Quadratic Voting Circuit Compilation Script
 *
 * This script compiles the D2 circuit and generates:
 * - WASM circuit for proof generation
 * - R1CS constraint system
 * - Groth16 proving/verification keys
 * - Solidity verifier contract
 */

import { execSync } from 'child_process'
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = join(__dirname, '..')
const CIRCUITS_DIR = join(ROOT_DIR, 'circuits')
const BUILD_DIR = join(CIRCUITS_DIR, 'build_d2')
const CONTRACTS_DIR = join(ROOT_DIR, 'contracts')

// Ensure build directory exists
if (!existsSync(BUILD_DIR)) {
  mkdirSync(BUILD_DIR, { recursive: true })
}

function run(cmd, cwd = CIRCUITS_DIR) {
  console.log(`\n$ ${cmd}`)
  try {
    execSync(cmd, { cwd, stdio: 'inherit' })
  } catch (error) {
    console.error(`Command failed: ${cmd}`)
    process.exit(1)
  }
}

async function main() {
  console.log('=== D2 Quadratic Voting Circuit Compilation ===\n')

  // Step 1: Compile circuit
  console.log('Step 1: Compiling D2_QuadraticVoting.circom...')
  run(`circom D2_QuadraticVoting.circom --r1cs --wasm --sym -o ${BUILD_DIR}`)

  // Step 2: Download powers of tau (if not exists)
  const ptauFile = join(CIRCUITS_DIR, 'powersOfTau28_hez_final_16.ptau')
  if (!existsSync(ptauFile)) {
    console.log('\nStep 2: Downloading powers of tau...')
    run(`curl -L -o powersOfTau28_hez_final_16.ptau https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_16.ptau`)
  } else {
    console.log('\nStep 2: Powers of tau already exists, skipping download...')
  }

  // Step 3: Setup Groth16
  console.log('\nStep 3: Setting up Groth16 proving key...')
  run(`snarkjs groth16 setup ${BUILD_DIR}/D2_QuadraticVoting.r1cs ${ptauFile} ${BUILD_DIR}/D2_QuadraticVoting_0000.zkey`)

  // Step 4: Contribute to phase 2
  console.log('\nStep 4: Contributing to phase 2 ceremony...')
  run(`snarkjs zkey contribute ${BUILD_DIR}/D2_QuadraticVoting_0000.zkey ${BUILD_DIR}/D2_QuadraticVoting_final.zkey --name="D2 Contribution" -v -e="random entropy for d2"`)

  // Step 5: Export verification key
  console.log('\nStep 5: Exporting verification key...')
  run(`snarkjs zkey export verificationkey ${BUILD_DIR}/D2_QuadraticVoting_final.zkey ${BUILD_DIR}/verification_key_d2.json`)

  // Step 6: Generate Solidity verifier
  console.log('\nStep 6: Generating Solidity verifier...')
  run(`snarkjs zkey export solidityverifier ${BUILD_DIR}/D2_QuadraticVoting_final.zkey ${BUILD_DIR}/Groth16VerifierD2.sol`)

  // Step 7: Copy verifier to contracts directory (without overwriting D1)
  console.log('\nStep 7: Copying verifier to contracts directory...')
  const sourceVerifier = join(BUILD_DIR, 'Groth16VerifierD2.sol')
  const destVerifier = join(CONTRACTS_DIR, 'Groth16VerifierD2.sol')

  if (existsSync(sourceVerifier)) {
    copyFileSync(sourceVerifier, destVerifier)
    console.log(`Copied: ${destVerifier}`)
  }

  console.log('\n=== D2 Circuit Compilation Complete! ===')
  console.log('\nGenerated files:')
  console.log(`  - ${BUILD_DIR}/D2_QuadraticVoting_js/D2_QuadraticVoting.wasm`)
  console.log(`  - ${BUILD_DIR}/D2_QuadraticVoting.r1cs`)
  console.log(`  - ${BUILD_DIR}/D2_QuadraticVoting_final.zkey`)
  console.log(`  - ${BUILD_DIR}/verification_key_d2.json`)
  console.log(`  - ${CONTRACTS_DIR}/Groth16VerifierD2.sol`)
}

main().catch(console.error)
