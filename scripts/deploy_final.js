#!/usr/bin/env node
/**
 * Deploy ZkVotingFinal to Sepolia
 *
 * Deployment order:
 * 1. Deploy Groth16Verifier (D1)
 * 2. Deploy Groth16VerifierD2 (D2)
 * 3. Deploy ZkVotingFinal with both verifier addresses
 *
 * Usage:
 *   node scripts/deploy_final.js
 *
 * Environment variables required:
 *   PRIVATE_KEY - Deployer wallet private key
 *   RPC_URL - Sepolia RPC URL (optional, defaults to public node)
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = join(__dirname, '..')

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const PRIVATE_KEY = process.env.PRIVATE_KEY

if (!PRIVATE_KEY) {
  console.error('Error: PRIVATE_KEY environment variable is required')
  console.error('Usage: PRIVATE_KEY=0x... node scripts/deploy_final.js')
  process.exit(1)
}

async function main() {
  console.log('=== ZkVotingFinal Deployment to Sepolia ===\n')

  // Setup clients
  const account = privateKeyToAccount(PRIVATE_KEY)
  console.log(`Deployer address: ${account.address}`)

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  })

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
  })

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`Balance: ${Number(balance) / 1e18} ETH\n`)

  if (balance < BigInt(0.01 * 1e18)) {
    console.error('Insufficient balance. Need at least 0.01 ETH for deployment.')
    process.exit(1)
  }

  // Compile contracts with Foundry
  console.log('Compiling contracts with Foundry...')
  try {
    execSync('forge build', { cwd: ROOT_DIR, stdio: 'inherit' })
  } catch (error) {
    console.error('Forge build failed. Make sure Foundry is installed.')
    process.exit(1)
  }

  // Read compiled artifacts
  const outDir = join(ROOT_DIR, 'out')

  // Get bytecodes from Foundry artifacts
  const verifierD1Artifact = JSON.parse(readFileSync(join(outDir, 'Groth16Verifier.sol', 'Groth16Verifier.json'), 'utf8'))
  const verifierD2Artifact = JSON.parse(readFileSync(join(outDir, 'Groth16VerifierD2.sol', 'Groth16Verifier.json'), 'utf8'))
  const zkVotingFinalArtifact = JSON.parse(readFileSync(join(outDir, 'ZkVotingFinal.sol', 'ZkVotingFinal.json'), 'utf8'))

  // Deploy VerifierD1
  console.log('\n--- Step 1: Deploying VerifierD1 ---')
  const verifierD1Hash = await walletClient.deployContract({
    abi: verifierD1Artifact.abi,
    bytecode: verifierD1Artifact.bytecode.object,
  })
  console.log(`Transaction hash: ${verifierD1Hash}`)

  const verifierD1Receipt = await publicClient.waitForTransactionReceipt({ hash: verifierD1Hash })
  const verifierD1Address = verifierD1Receipt.contractAddress
  console.log(`VerifierD1 deployed at: ${verifierD1Address}`)

  // Deploy VerifierD2
  console.log('\n--- Step 2: Deploying VerifierD2 ---')
  const verifierD2Hash = await walletClient.deployContract({
    abi: verifierD2Artifact.abi,
    bytecode: verifierD2Artifact.bytecode.object,
  })
  console.log(`Transaction hash: ${verifierD2Hash}`)

  const verifierD2Receipt = await publicClient.waitForTransactionReceipt({ hash: verifierD2Hash })
  const verifierD2Address = verifierD2Receipt.contractAddress
  console.log(`VerifierD2 deployed at: ${verifierD2Address}`)

  // Deploy ZkVotingFinal
  console.log('\n--- Step 3: Deploying ZkVotingFinal ---')
  const zkVotingFinalHash = await walletClient.deployContract({
    abi: zkVotingFinalArtifact.abi,
    bytecode: zkVotingFinalArtifact.bytecode.object,
    args: [verifierD1Address, verifierD2Address],
  })
  console.log(`Transaction hash: ${zkVotingFinalHash}`)

  const zkVotingFinalReceipt = await publicClient.waitForTransactionReceipt({ hash: zkVotingFinalHash })
  const zkVotingFinalAddress = zkVotingFinalReceipt.contractAddress
  console.log(`ZkVotingFinal deployed at: ${zkVotingFinalAddress}`)

  // Update frontend config
  console.log('\n--- Step 4: Updating frontend config ---')
  const configPath = join(ROOT_DIR, 'src', 'config.json')
  const config = {
    network: 'sepolia',
    contracts: {
      verifierD1: verifierD1Address,
      verifierD2: verifierD2Address,
      zkVotingFinal: zkVotingFinalAddress,
      // Keep old addresses for reference
      privateVoting: '0xc3bF134b60FA8ac7366CA0DeDbD50ECd9751ab39',
      groth16Verifier: '0x4E510852F416144f0C0d7Ef83F0a4ab28aCba864',
    },
    deployedAt: new Date().toISOString(),
    deployer: account.address,
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`Config updated: ${configPath}`)

  // Summary
  console.log('\n=== Deployment Complete ===')
  console.log('\nContract Addresses:')
  console.log(`  VerifierD1:      ${verifierD1Address}`)
  console.log(`  VerifierD2:      ${verifierD2Address}`)
  console.log(`  ZkVotingFinal:   ${zkVotingFinalAddress}`)
  console.log('\nEtherscan links:')
  console.log(`  https://sepolia.etherscan.io/address/${verifierD1Address}`)
  console.log(`  https://sepolia.etherscan.io/address/${verifierD2Address}`)
  console.log(`  https://sepolia.etherscan.io/address/${zkVotingFinalAddress}`)

  return {
    verifierD1: verifierD1Address,
    verifierD2: verifierD2Address,
    zkVotingFinal: zkVotingFinalAddress,
  }
}

main().catch(console.error)
