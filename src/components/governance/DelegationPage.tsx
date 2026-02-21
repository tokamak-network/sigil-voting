'use client'

import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useTranslation } from '../../i18n'
import {
  DELEGATION_REGISTRY_ADDRESS,
  DELEGATION_REGISTRY_ABI,
} from '../../contractV2'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function DelegationPage() {
  const { t } = useTranslation()
  const { address, isConnected } = useAccount()
  const [delegateAddress, setDelegateAddress] = useState('')
  const [error, setError] = useState('')

  const isConfigured = DELEGATION_REGISTRY_ADDRESS !== ZERO_ADDRESS

  // Read current delegate
  const { data: currentDelegate, refetch: refetchDelegate } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'getDelegate',
    args: address ? [address] : undefined,
    query: { enabled: isConfigured && !!address },
  })

  const { data: isDelegating, refetch: refetchIsDelegating } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'isDelegating',
    args: address ? [address] : undefined,
    query: { enabled: isConfigured && !!address },
  })

  // Write: delegate
  const { writeContract: writeDelegateContract, data: delegateTxHash, isPending: isDelegatingTx } = useWriteContract()
  const { isLoading: isDelegateConfirming, isSuccess: isDelegateSuccess } = useWaitForTransactionReceipt({
    hash: delegateTxHash,
  })

  // Write: undelegate
  const { writeContract: writeUndelegateContract, data: undelegateTxHash, isPending: isUndelegatingTx } = useWriteContract()
  const { isLoading: isUndelegateConfirming, isSuccess: isUndelegateSuccess } = useWaitForTransactionReceipt({
    hash: undelegateTxHash,
  })

  const handleDelegate = async () => {
    setError('')
    if (!delegateAddress || !delegateAddress.startsWith('0x') || delegateAddress.length !== 42) {
      setError(t.governance.delegation.error)
      return
    }
    if (delegateAddress.toLowerCase() === address?.toLowerCase()) {
      setError(t.governance.delegation.selfDelegateError)
      return
    }
    try {
      writeDelegateContract({
        address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'delegate',
        args: [delegateAddress as `0x${string}`],
      })
    } catch {
      setError(t.governance.delegation.error)
    }
  }

  const handleUndelegate = async () => {
    setError('')
    try {
      writeUndelegateContract({
        address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'undelegate',
      })
    } catch {
      setError(t.governance.delegation.error)
    }
  }

  // Refetch on success
  if (isDelegateSuccess || isUndelegateSuccess) {
    refetchDelegate()
    refetchIsDelegating()
  }

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
              disabled={isUndelegatingTx || isUndelegateConfirming}
              className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 hover:bg-red-600 transition-colors"
            >
              {isUndelegatingTx || isUndelegateConfirming
                ? t.governance.delegation.undelegating
                : t.governance.delegation.undelegate}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t.governance.delegation.notDelegating}</p>
        )}
      </div>

      {/* Success messages */}
      {isDelegateSuccess && (
        <div className="bg-green-50 border-2 border-green-500 text-green-700 p-3 mb-4 text-sm font-bold">
          {t.governance.delegation.delegateSuccess}
        </div>
      )}
      {isUndelegateSuccess && (
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
            disabled={isDelegatingTx || isDelegateConfirming || !delegateAddress}
            className="w-full bg-black text-white font-bold py-2 text-sm hover:bg-slate-800 transition-colors border-2 border-black disabled:opacity-50"
          >
            {isDelegatingTx || isDelegateConfirming
              ? t.governance.delegation.delegating
              : t.governance.delegation.delegate}
          </button>
        </div>
      )}
    </div>
  )
}

export default DelegationPage
