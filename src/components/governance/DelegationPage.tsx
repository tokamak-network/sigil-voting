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
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [delegateAddress, setDelegateAddress] = useState('')
  const [error, setError] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [lastAction, setLastAction] = useState<'delegate' | 'undelegate' | null>(null)
  const [showDelegateSuccess, setShowDelegateSuccess] = useState(false)
  const [showUndelegateSuccess, setShowUndelegateSuccess] = useState(false)

  const isConfigured = DELEGATION_REGISTRY_ADDRESS !== ZERO_ADDRESS

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

  // Write: delegate
  const { writeContractAsync: writeDelegateContract, isPending: isDelegatingTx } = useWriteContract()

  // Write: undelegate
  const { writeContractAsync: writeUndelegateContract, isPending: isUndelegatingTx } = useWriteContract()

  const handleDelegate = async () => {
    setError('')
    setShowDelegateSuccess(false)
    setShowUndelegateSuccess(false)
    setLastAction('delegate')
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
      const hash = await writeDelegateContract({
        address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'delegate',
        args: [delegateAddress as `0x${string}`],
      })
      if (publicClient && hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
        if (receipt.status !== 'success') throw new Error('tx reverted')
      }
      await refetchDelegate()
      await refetchIsDelegating()
      setShowDelegateSuccess(true)
    } catch {
      setError(t.governance.delegation.error)
    } finally {
      setIsConfirming(false)
    }
  }

  const handleUndelegate = async () => {
    setError('')
    setShowDelegateSuccess(false)
    setShowUndelegateSuccess(false)
    setLastAction('undelegate')
    try {
      setIsConfirming(true)
      const hash = await writeUndelegateContract({
        address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'undelegate',
      })
      if (publicClient && hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
        if (receipt.status !== 'success') throw new Error('tx reverted')
      }
      await refetchDelegate()
      await refetchIsDelegating()
      setShowUndelegateSuccess(true)
    } catch {
      setError(t.governance.delegation.error)
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
