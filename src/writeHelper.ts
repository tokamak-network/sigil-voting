/**
 * Direct wallet write helper — bypasses wagmi's connector layer entirely.
 * Uses window.ethereum + viem createWalletClient to avoid
 * "connection.connector.getChainId is not a function" errors.
 */
import { createWalletClient, custom, type Abi } from 'viem'
import { sepolia } from 'viem/chains'
import { getEthereumProvider } from './lib/ethereum'

export async function writeContract<TAbi extends Abi>(params: {
  address: `0x${string}`
  abi: TAbi
  functionName: string
  args: readonly unknown[]
  gas?: bigint
  account: `0x${string}`
}): Promise<`0x${string}`> {
  const provider = getEthereumProvider()
  if (!provider) throw new Error('No wallet provider found. Please install MetaMask or another wallet.')

  // Verify user is on Sepolia before sending transaction
  const chainId = (await provider.request({ method: 'eth_chainId' })) as string
  if (parseInt(chainId, 16) !== sepolia.id) {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x' + sepolia.id.toString(16) }],
      })
    } catch {
      throw new Error('Please switch to Sepolia testnet.')
    }
  }

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
  } as Parameters<typeof client.writeContract>[0])

  return hash
}
