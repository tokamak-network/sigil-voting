'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { useTranslation } from '../../i18n'
import {
  DELEGATION_REGISTRY_ADDRESS,
  DELEGATION_REGISTRY_ABI,
} from '../../contractV2'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function DelegationPage() {
  const { t } = useTranslation()
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()
  const [mounted, setMounted] = useState(false)
  const [delegateAddress, setDelegateAddress] = useState('')
  const [error, setError] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [lastAction, setLastAction] = useState<'delegate' | 'undelegate' | null>(null)
  const [showDelegateSuccess, setShowDelegateSuccess] = useState(false)
  const [showUndelegateSuccess, setShowUndelegateSuccess] = useState(false)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'failed'>('idle')

  const isConfigured = DELEGATION_REGISTRY_ADDRESS !== ZERO_ADDRESS
  const isWrongNetwork = chainId !== undefined && chainId !== 11155111

  const estimateGasWithBuffer = async (functionName: 'delegate' | 'undelegate', args?: readonly unknown[]) => {
    const fallbackGas = 200_000n
    if (!publicClient || !address) return fallbackGas
    try {
      const gas = await publicClient.estimateContractGas({
        address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
        abi: DELEGATION_REGISTRY_ABI,
        functionName,
        args,
        account: address,
      })
      return (gas * 120n) / 100n + 25_000n
    } catch {
      return fallbackGas
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // Read current delegate
  const { data: currentDelegate, refetch: refetchDelegate } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'getDelegate',
    args: address ? [address] : undefined,
    query: { enabled: isConfigured && !!address, refetchInterval: 4000 },
  })

  const { data: isDelegating, refetch: refetchIsDelegating } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'isDelegating',
    args: address ? [address] : undefined,
    query: { enabled: isConfigured && !!address, refetchInterval: 4000 },
  })
  const { data: delegators } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'getDelegators',
    args: address ? [address] : undefined,
    query: { enabled: isConfigured && !!address, refetchInterval: 4000 },
  })
  const delegatorList = Array.isArray(delegators) ? delegators : []

  // Write: delegate
  const { writeContractAsync: writeDelegateContract, isPending: isDelegatingTx } = useWriteContract()

  // Write: undelegate
  const { writeContractAsync: writeUndelegateContract, isPending: isUndelegatingTx } = useWriteContract()

  const handleDelegate = async () => {
    setError('')
    setShowDelegateSuccess(false)
    setShowUndelegateSuccess(false)
    setTxStatus('idle')
    setTxHash(null)
    setLastAction('delegate')
    if (isWrongNetwork) {
      setError(t.maci?.switchNetwork || t.governance.delegation.error)
      return
    }
    if (!delegateAddress || !delegateAddress.startsWith('0x') || delegateAddress.length !== 42) {
      setError(t.governance.delegation.error)
      return
    }
    if (delegateAddress.toLowerCase() === address?.toLowerCase()) {
      setError(t.governance.delegation.selfDelegateError)
      return
    }
    try {
      setIsConfirming(true)
      setTxStatus('pending')
      const gas = await estimateGasWithBuffer('delegate', [delegateAddress as `0x${string}`])
      const hash = await writeDelegateContract({
        address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'delegate',
        args: [delegateAddress as `0x${string}`],
        ...(gas ? { gas: gas } : {}),
      })
      if (hash) setTxHash(hash as `0x${string}`)
      if (publicClient && hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
        if (receipt.status !== 'success') {
          setTxStatus('failed')
          throw new Error('tx reverted')
        }
      }
      await refetchDelegate()
      await refetchIsDelegating()
      setShowDelegateSuccess(true)
      setTxStatus('success')
    } catch {
      setError(t.governance.delegation.error)
      setTxStatus('failed')
    } finally {
      setIsConfirming(false)
    }
  }

  const handleUndelegate = async () => {
    setError('')
    setShowDelegateSuccess(false)
    setShowUndelegateSuccess(false)
    setTxStatus('idle')
    setTxHash(null)
    setLastAction('undelegate')
    if (isWrongNetwork) {
      setError(t.maci?.switchNetwork || t.governance.delegation.error)
      return
    }
    try {
      setIsConfirming(true)
      setTxStatus('pending')
      const gas = await estimateGasWithBuffer('undelegate')
      const hash = await writeUndelegateContract({
        address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'undelegate',
        ...(gas ? { gas: gas } : {}),
      })
      if (hash) setTxHash(hash as `0x${string}`)
      if (publicClient && hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
        if (receipt.status !== 'success') {
          setTxStatus('failed')
          throw new Error('tx reverted')
        }
      }
      await refetchDelegate()
      await refetchIsDelegating()
      setShowUndelegateSuccess(true)
      setTxStatus('success')
    } catch {
      setError(t.governance.delegation.error)
      setTxStatus('failed')
    } finally {
      setIsConfirming(false)
    }
  }

  // Safety refetch when address changes
  useEffect(() => {
    if (address) {
      refetchDelegate()
      refetchIsDelegating()
    }
  }, [address, refetchDelegate, refetchIsDelegating])

  const shortenAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)

  if (!mounted) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <h1 className="text-2xl font-display font-extrabold mb-4">{t.governance.delegation.title}</h1>
        <p className="text-slate-500">{t.maci.waiting.processing}</p>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <h1 className="text-2xl font-display font-extrabold mb-4">{t.governance.delegation.title}</h1>
        <p className="text-slate-500">{t.maci.connectWallet}</p>
      </div>
    )
  }

  if (!isConfigured) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <h1 className="text-2xl font-display font-extrabold mb-4">{t.governance.delegation.title}</h1>
        <p className="text-slate-500">{t.maci.notDeployedDesc}</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-display font-extrabold mb-2">{t.governance.delegation.title}</h1>
      <p className="text-sm text-slate-500 mb-6">{t.governance.delegation.description}</p>

      {isWrongNetwork && (
        <div className="bg-amber-50 border-2 border-amber-500 text-amber-700 p-3 mb-4 text-sm font-bold">
          {t.maci?.wrongNetwork || t.governance.delegation.error}
        </div>
      )}

      {/* Current delegation status */}
      <div className="border-2 border-border-light dark:border-border-dark p-4 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          {t.governance.delegation.currentDelegate}
        </h2>
        {isDelegating ? (
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold">
              {currentDelegate ? shortenAddress(currentDelegate as string) : '...'}
            </span>
            <button
              onClick={handleUndelegate}
              disabled={isUndelegatingTx || (isConfirming && lastAction === 'undelegate')}
              className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 hover:bg-red-600 transition-colors"
            >
              {isUndelegatingTx || (isConfirming && lastAction === 'undelegate')
                ? t.governance.delegation.undelegating
                : t.governance.delegation.undelegate}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t.governance.delegation.notDelegating}</p>
        )}
        {delegatorList.length > 0 && (
          <p className="text-xs text-slate-500 mt-2">
            {t.governance.delegation.received} {delegatorList.length}
          </p>
        )}
        <p className="text-xs text-slate-400 mt-3">{t.governance.delegation.effectNote}</p>
      </div>

      {/* Success messages */}
      {showDelegateSuccess && (
        <div className="bg-green-50 border-2 border-green-500 text-green-700 p-3 mb-4 text-sm font-bold">
          {t.governance.delegation.delegateSuccess}
        </div>
      )}
      {showUndelegateSuccess && (
        <div className="bg-green-50 border-2 border-green-500 text-green-700 p-3 mb-4 text-sm font-bold">
          {t.governance.delegation.undelegateSuccess}
        </div>
      )}
      {txStatus === 'pending' && txHash && (
        <div className="bg-slate-50 border-2 border-slate-300 text-slate-700 p-3 mb-4 text-xs font-mono">
          Pending: {txHash.slice(0, 10)}...{txHash.slice(-8)}
        </div>
      )}

      {/* Delegate form */}
      {!isDelegating && (
        <div className="border-2 border-border-light dark:border-border-dark p-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            {t.governance.delegation.delegateTo}
          </label>
          <input
            type="text"
            value={delegateAddress}
            onChange={(e) => setDelegateAddress(e.target.value)}
            placeholder={t.governance.delegation.addressPlaceholder}
            className="w-full border-2 border-border-light dark:border-border-dark p-2 text-sm font-mono mb-3 focus:outline-none focus:border-primary"
          />
          {error && (
            <p className="text-red-500 text-xs font-bold mb-3">{error}</p>
          )}
          <button
            onClick={handleDelegate}
            disabled={isDelegatingTx || (isConfirming && lastAction === 'delegate') || !delegateAddress}
            className="w-full bg-black text-white font-bold py-2 text-sm hover:bg-slate-800 transition-colors border-2 border-black disabled:opacity-50"
          >
            {isDelegatingTx || (isConfirming && lastAction === 'delegate')
              ? t.governance.delegation.delegating
              : t.governance.delegation.delegate}
          </button>
        </div>
      )}
    </div>
  )
}

export default DelegationPage
