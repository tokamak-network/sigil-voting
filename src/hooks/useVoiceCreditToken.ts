import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import {
  VOICE_CREDIT_PROXY_ADDRESS,
  ERC20_VOICE_CREDIT_PROXY_ABI,
  ERC20_ABI,
} from '../contractV2'

export function useVoiceCreditToken() {
  const { address } = useAccount()

  // 1. Read token address from voiceCreditProxy
  const { data: tokenAddress, isLoading: loadingToken } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: ERC20_VOICE_CREDIT_PROXY_ABI,
    functionName: 'token',
    query: { enabled: VOICE_CREDIT_PROXY_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  // 2. Read decimals from voiceCreditProxy (cached at deploy)
  const { data: proxyDecimals } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: ERC20_VOICE_CREDIT_PROXY_ABI,
    functionName: 'tokenDecimals',
    query: { enabled: VOICE_CREDIT_PROXY_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  })

  const tokenAddr = tokenAddress as `0x${string}` | undefined
  const hasToken = !!tokenAddr && tokenAddr !== '0x0000000000000000000000000000000000000000'

  // 3. Read ERC20 symbol
  const { data: symbol } = useReadContract({
    address: tokenAddr!,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: hasToken },
  })

  // 4. Read ERC20 name
  const { data: name } = useReadContract({
    address: tokenAddr!,
    abi: ERC20_ABI,
    functionName: 'name',
    query: { enabled: hasToken },
  })

  // 5. Read user balance
  const { data: balance, isLoading: loadingBalance } = useReadContract({
    address: tokenAddr!,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: hasToken && !!address },
  })

  const decimals = proxyDecimals !== undefined ? Number(proxyDecimals) : 18
  const rawBalance = balance as bigint | undefined

  return {
    tokenAddress: tokenAddr,
    symbol: (symbol as string) || 'Token',
    name: (name as string) || '',
    decimals,
    balance: rawBalance,
    formattedBalance: rawBalance !== undefined
      ? Number(formatUnits(rawBalance, decimals)).toLocaleString()
      : '0',
    isLoading: loadingToken || loadingBalance,
  }
}
