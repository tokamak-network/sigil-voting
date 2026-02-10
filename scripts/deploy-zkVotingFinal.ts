import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const configPath = path.join(__dirname, "../src/config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const verifierD1 = config.contracts.verifierD1;
  const verifierD2 = config.contracts.verifierD2;
  const tonToken = config.contracts.tonToken;
  const treasury = config.contracts.treasury;

  console.log("Deploying ZkVotingFinal with:");
  console.log("  verifierD1:", verifierD1);
  console.log("  verifierD2:", verifierD2);
  console.log("  tonToken:", tonToken);
  console.log("  treasury:", treasury);

  const ZkVotingFinal = await ethers.getContractFactory("ZkVotingFinal");
  const zkVotingFinal = await ZkVotingFinal.deploy(verifierD1, verifierD2, tonToken, treasury);
  await zkVotingFinal.waitForDeployment();

  const address = await zkVotingFinal.getAddress();
  console.log("ZkVotingFinal deployed to:", address);

  // Update config
  config.contracts.zkVotingFinal = address;
  config.deployedAt = new Date().toISOString();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("Config updated with new address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
