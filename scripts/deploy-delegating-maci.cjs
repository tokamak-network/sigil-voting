/* eslint-disable no-console */
require('dotenv').config()

const hre = require('hardhat')

const DEFAULTS = {
  token: '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044',
  gatekeeper: '0x4c18984A78910Dd1976d6DFd820f6d18e7edD672',
  stateTreeDepth: 2,
  accQueueSubDepth: 2,
  proposalGateThreshold: '100',
}

async function main() {
  const { ethers } = hre
  const signers = await ethers.getSigners()
  if (signers.length === 0) {
    throw new Error('No deployer signer found. Set PRIVATE_KEY in .env')
  }
  const deployer = signers[0]

  const token = process.env.TOKEN_ADDRESS || DEFAULTS.token
  const gatekeeper = process.env.GATEKEEPER_ADDRESS || DEFAULTS.gatekeeper
  const stateTreeDepth = Number(process.env.STATE_TREE_DEPTH || DEFAULTS.stateTreeDepth)
  const accQueueSubDepth = Number(process.env.ACCQUEUE_SUB_DEPTH || DEFAULTS.accQueueSubDepth)
  const proposalGateThreshold = process.env.PROPOSAL_GATE_THRESHOLD || DEFAULTS.proposalGateThreshold

  if (!token || token === '0x0000000000000000000000000000000000000000') {
    throw new Error('TOKEN_ADDRESS is required')
  }
  if (!gatekeeper || gatekeeper === '0x0000000000000000000000000000000000000000') {
    throw new Error('GATEKEEPER_ADDRESS is required')
  }

  console.log('Deployer:', deployer.address)
  console.log('Token:', token)
  console.log('Gatekeeper:', gatekeeper)
  console.log('stateTreeDepth:', stateTreeDepth)
  console.log('accQueueSubDepth:', accQueueSubDepth)

  const PoseidonT4 = await ethers.getContractFactory('PoseidonT4')
  const poseidonT4 = await PoseidonT4.deploy()
  await poseidonT4.waitForDeployment()
  const poseidonT4Address = await poseidonT4.getAddress()
  console.log('PoseidonT4:', poseidonT4Address)

  const PoseidonT5 = await ethers.getContractFactory('PoseidonT5')
  const poseidonT5 = await PoseidonT5.deploy()
  await poseidonT5.waitForDeployment()
  const poseidonT5Address = await poseidonT5.getAddress()
  console.log('PoseidonT5:', poseidonT5Address)

  const PoseidonT6 = await ethers.getContractFactory('PoseidonT6')
  const poseidonT6 = await PoseidonT6.deploy()
  await poseidonT6.waitForDeployment()
  const poseidonT6Address = await poseidonT6.getAddress()
  console.log('PoseidonT6:', poseidonT6Address)

  const DelegationRegistry = await ethers.getContractFactory('DelegationRegistry')
  const delegationRegistry = await DelegationRegistry.deploy()
  await delegationRegistry.waitForDeployment()
  const delegationRegistryAddress = await delegationRegistry.getAddress()
  console.log('DelegationRegistry:', delegationRegistryAddress)

  const DelegatingVoiceCreditProxy = await ethers.getContractFactory('DelegatingVoiceCreditProxy')
  const voiceCreditProxy = await DelegatingVoiceCreditProxy.deploy(token, delegationRegistryAddress)
  await voiceCreditProxy.waitForDeployment()
  const voiceCreditProxyAddress = await voiceCreditProxy.getAddress()
  console.log('DelegatingVoiceCreditProxy:', voiceCreditProxyAddress)

  const AccQueue = await ethers.getContractFactory('AccQueue', {
    libraries: {
      'poseidon-solidity/PoseidonT6.sol:PoseidonT6': poseidonT6Address,
    },
  })
  const stateAq = await AccQueue.deploy(5, accQueueSubDepth)
  await stateAq.waitForDeployment()
  const accQueueAddress = await stateAq.getAddress()
  console.log('AccQueue:', accQueueAddress)

  const MACI = await ethers.getContractFactory('MACI', {
    libraries: {
      'contracts/PoseidonT5.sol:PoseidonT5': poseidonT5Address,
      'poseidon-solidity/PoseidonT4.sol:PoseidonT4': poseidonT4Address,
      'poseidon-solidity/PoseidonT6.sol:PoseidonT6': poseidonT6Address,
    },
  })
  const maci = await MACI.deploy(gatekeeper, voiceCreditProxyAddress, stateTreeDepth, accQueueAddress)
  await maci.waitForDeployment()
  const maciAddress = await maci.getAddress()
  console.log('MACI:', maciAddress)

  await (await stateAq.transferOwnership(maciAddress)).wait()
  await (await maci.init()).wait()
  await (await maci.setDelegationRegistry(delegationRegistryAddress)).wait()

  // Enable proposal creation for token holders by default
  const erc20 = new ethers.Contract(token, ['function decimals() view returns (uint8)'], deployer)
  let decimals = 18
  try {
    decimals = Number(await erc20.decimals())
  } catch {
    decimals = 18
  }
  const threshold = ethers.parseUnits(String(proposalGateThreshold), decimals)
  await (await maci.addProposalGate(token, threshold)).wait()
  console.log('ProposalGate:', token, threshold.toString())

  const TimelockExecutor = await ethers.getContractFactory('TimelockExecutor')
  const timelockExecutor = await TimelockExecutor.deploy(maciAddress)
  await timelockExecutor.waitForDeployment()
  const timelockExecutorAddress = await timelockExecutor.getAddress()
  console.log('TimelockExecutor:', timelockExecutorAddress)

  const deployBlock = await ethers.provider.getBlockNumber()
  const summary = {
    maci: maciAddress,
    accQueue: accQueueAddress,
    voiceCreditProxy: voiceCreditProxyAddress,
    delegationRegistry: delegationRegistryAddress,
    timelockExecutor: timelockExecutorAddress,
    deployBlock,
  }

  console.log('DEPLOY_SUMMARY_JSON:', JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
