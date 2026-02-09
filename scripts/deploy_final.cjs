/**
 * Deploy ZkVotingFinal to Sepolia using Hardhat
 *
 * Usage:
 *   npx hardhat run scripts/deploy_final.cjs --network sepolia
 *
 * Environment variables required:
 *   PRIVATE_KEY - Deployer wallet private key
 *   SEPOLIA_RPC_URL - (optional) Sepolia RPC URL
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=== ZkVotingFinal Deployment to Sepolia ===\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  if (balance < hre.ethers.parseEther("0.01")) {
    throw new Error("Insufficient balance. Need at least 0.01 ETH for deployment.");
  }

  // Step 1: Deploy VerifierD1 (기존 Groth16Verifier)
  console.log("--- Step 1: Deploying VerifierD1 ---");
  const VerifierD1 = await hre.ethers.getContractFactory("contracts/Groth16Verifier.sol:Groth16Verifier");
  const verifierD1 = await VerifierD1.deploy();
  await verifierD1.waitForDeployment();
  const verifierD1Address = await verifierD1.getAddress();
  console.log("VerifierD1 deployed at:", verifierD1Address);

  // Step 2: Deploy VerifierD2
  console.log("\n--- Step 2: Deploying VerifierD2 ---");
  const VerifierD2 = await hre.ethers.getContractFactory("contracts/Groth16VerifierD2.sol:Groth16Verifier");
  const verifierD2 = await VerifierD2.deploy();
  await verifierD2.waitForDeployment();
  const verifierD2Address = await verifierD2.getAddress();
  console.log("VerifierD2 deployed at:", verifierD2Address);

  // Step 3: Deploy PoseidonT5 library
  console.log("\n--- Step 3: Deploying PoseidonT5 library ---");
  const PoseidonT5 = await hre.ethers.getContractFactory("PoseidonT5");
  const poseidonT5 = await PoseidonT5.deploy();
  await poseidonT5.waitForDeployment();
  const poseidonT5Address = await poseidonT5.getAddress();
  console.log("PoseidonT5 deployed at:", poseidonT5Address);

  // Step 4: Deploy ZkVotingFinal (linked with PoseidonT5)
  console.log("\n--- Step 4: Deploying ZkVotingFinal ---");
  const ZkVotingFinal = await hre.ethers.getContractFactory("ZkVotingFinal", {
    libraries: {
      PoseidonT5: poseidonT5Address,
    },
  });
  const zkVotingFinal = await ZkVotingFinal.deploy(verifierD1Address, verifierD2Address);
  await zkVotingFinal.waitForDeployment();
  const zkVotingFinalAddress = await zkVotingFinal.getAddress();
  console.log("ZkVotingFinal deployed at:", zkVotingFinalAddress);

  // Step 5: Update frontend config
  console.log("\n--- Step 5: Updating frontend config ---");
  const configPath = path.join(__dirname, "..", "src", "config.json");
  const config = {
    network: "sepolia",
    contracts: {
      verifierD1: verifierD1Address,
      verifierD2: verifierD2Address,
      zkVotingFinal: zkVotingFinalAddress,
      poseidonT5: poseidonT5Address,
      // Keep old D1 addresses for backwards compatibility
      privateVoting: "0xc3bF134b60FA8ac7366CA0DeDbD50ECd9751ab39",
      groth16Verifier: "0x4E510852F416144f0C0d7Ef83F0a4ab28aCba864",
    },
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("Config updated:", configPath);

  // Step 6: Copy D2 circuit files to public folder
  console.log("\n--- Step 6: Copying D2 circuit files ---");
  const circuitsPublicDir = path.join(__dirname, "..", "public", "circuits");
  if (!fs.existsSync(circuitsPublicDir)) {
    fs.mkdirSync(circuitsPublicDir, { recursive: true });
  }

  const d2BuildDir = path.join(__dirname, "..", "circuits", "build_d2");
  const filesToCopy = [
    { src: "D2_QuadraticVoting_js/D2_QuadraticVoting.wasm", dest: "D2_QuadraticVoting.wasm" },
    { src: "D2_QuadraticVoting_final.zkey", dest: "D2_QuadraticVoting_final.zkey" },
  ];

  for (const file of filesToCopy) {
    const srcPath = path.join(d2BuildDir, file.src);
    const destPath = path.join(circuitsPublicDir, file.dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${file.dest}`);
    } else {
      console.warn(`Warning: ${srcPath} not found`);
    }
  }

  // Summary
  console.log("\n=== Deployment Complete ===");
  console.log("\nContract Addresses:");
  console.log("  VerifierD1:      ", verifierD1Address);
  console.log("  VerifierD2:      ", verifierD2Address);
  console.log("  PoseidonT5:      ", poseidonT5Address);
  console.log("  ZkVotingFinal:   ", zkVotingFinalAddress);
  console.log("\nEtherscan links:");
  console.log(`  https://sepolia.etherscan.io/address/${verifierD1Address}`);
  console.log(`  https://sepolia.etherscan.io/address/${verifierD2Address}`);
  console.log(`  https://sepolia.etherscan.io/address/${poseidonT5Address}`);
  console.log(`  https://sepolia.etherscan.io/address/${zkVotingFinalAddress}`);

  return {
    verifierD1: verifierD1Address,
    verifierD2: verifierD2Address,
    zkVotingFinal: zkVotingFinalAddress,
  };
}

main()
  .then((addresses) => {
    console.log("\nDeployment successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
