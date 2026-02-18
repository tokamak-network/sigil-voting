/**
 * Direct wallet write helper — bypasses wagmi's connector layer entirely.
 * Uses window.ethereum + viem createWalletClient to avoid
 * "connection.connector.getChainId is not a function" errors.
 */
import { createWalletClient, custom, type Abi } from 'viem'
import { sepolia } from 'viem/chains'

export async function writeContract<TAbi extends Abi>(params: {
  address: `0x${string}`
  abi: TAbi
  functionName: string
  args: readonly unknown[]
  gas?: bigint
  account: `0x${string}`
}): Promise<`0x${string}`> {
  const provider = (window as any).ethereum
  if (!provider) throw new Error('No wallet provider found. Please install MetaMask or another wallet.')

  const client = createWalletClient({
    account: params.account,
    chain: sepolia,
    transport: custom(provider),
  })

  const hash = await client.writeContract({
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args,
    gas: params.gas,
  } as any)

  return hash
}
