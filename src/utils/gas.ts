import type { Abi, PublicClient } from 'viem'

export async function estimateGasWithBuffer(params: {
  publicClient?: PublicClient | null
  address: `0x${string}`
  abi: Abi
  functionName: string
  args?: readonly unknown[]
  account?: `0x${string}`
  fallbackGas: bigint
  bufferBps?: bigint
  bufferAdd?: bigint
}): Promise<bigint> {
  const {
    publicClient,
    address,
    abi,
    functionName,
    args,
    account,
    fallbackGas,
    bufferBps = 120n,
    bufferAdd = 25_000n,
  } = params

  if (!publicClient || !account) return fallbackGas

  try {
    const gas = await publicClient.estimateContractGas({
      address,
      abi,
      functionName,
      args,
      account,
    })
    return (gas * bufferBps) / 100n + bufferAdd
  } catch {
    return fallbackGas
  }
}
