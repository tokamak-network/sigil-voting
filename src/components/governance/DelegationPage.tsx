'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { useTranslation } from '../../i18n'
import { storageKey } from '../../storageKeys'
import {
  VOICE_CREDIT_PROXY_ADDRESS,
  DELEGATING_VOICE_CREDIT_PROXY_ABI,
  DELEGATION_REGISTRY_ADDRESS,
  DELEGATION_REGISTRY_ABI,
  MACI_DEPLOY_BLOCK,
} from '../../contractV2'
import { getLogsChunked } from '../../utils/viemLogs'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

interface DelegateEntry {
  address: `0x${string}`
  delegatorCount: number
}

const DELEGATED_EVENT = {
  type: 'event' as const,
  name: 'Delegated',
  inputs: [
    { name: 'delegator', type: 'address', indexed: true },
    { name: 'delegate', type: 'address', indexed: true },
  ],
}
const UNDELEGATED_EVENT = {
  type: 'event' as const,
  name: 'Undelegated',
  inputs: [
    { name: 'delegator', type: 'address', indexed: true },
    { name: 'previousDelegate', type: 'address', indexed: true },
  ],
}

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

  // Marketplace state
  const [delegates, setDelegates] = useState<DelegateEntry[]>([])
  const [marketplaceLoading, setMarketplaceLoading] = useState(false)
  const [marketplaceSearch, setMarketplaceSearch] = useState('')

  const isConfigured = DELEGATION_REGISTRY_ADDRESS !== ZERO_ADDRESS
  const isWrongNetwork = chainId !== undefined && chainId !== 11155111

  const filteredDelegates = delegates.filter(
    (d) =>
      d.address !== address?.toLowerCase() &&
      (marketplaceSearch === '' || d.address.toLowerCase().includes(marketplaceSearch.toLowerCase())),
  )

  // Load delegate marketplace: parse Delegated/Undelegated events to find active delegates
  const loadDelegates = useCallback(async () => {
    if (!publicClient || DELEGATION_REGISTRY_ADDRESS === ZERO_ADDRESS) return
    setMarketplaceLoading(true)
    try {
      const fromBlock = MACI_DEPLOY_BLOCK ?? 0n
      const [delegatedLogs, undelegatedLogs] = await Promise.all([
        getLogsChunked(
          publicClient,
          { address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`, event: DELEGATED_EVENT },
          fromBlock,
          'latest',
        ),
        getLogsChunked(
          publicClient,
          { address: DELEGATION_REGISTRY_ADDRESS as `0x${string}`, event: UNDELEGATED_EVENT },
          fromBlock,
          'latest',
        ),
      ])

      // Build set of currently active delegators (delegated but not undelegated later)
      // Use a map: delegator -> latestDelegate (from most recent Delegated event)
      // viem returns args on typed event logs; cast through unknown to access
      type LogWithDelegatedArgs = { args: { delegator?: string; delegate?: string } }
      type LogWithUndelegatedArgs = { args: { delegator?: string } }
      const delegatorToDelegate = new Map<string, string>()
      for (const log of delegatedLogs) {
        const { delegator, delegate } = (log as unknown as LogWithDelegatedArgs).args
        if (delegator && delegate) {
          delegatorToDelegate.set(delegator.toLowerCase(), delegate.toLowerCase())
        }
      }
      // Remove undelegated ones
      for (const log of undelegatedLogs) {
        const { delegator } = (log as unknown as LogWithUndelegatedArgs).args
        if (delegator) {
          delegatorToDelegate.delete(delegator.toLowerCase())
        }
      }

      // Count delegators per delegate
      const delegateCount = new Map<string, number>()
      for (const delegate of delegatorToDelegate.values()) {
        delegateCount.set(delegate, (delegateCount.get(delegate) ?? 0) + 1)
      }

      const entries: DelegateEntry[] = Array.from(delegateCount.entries())
        .map(([addr, count]) => ({
          address: addr as `0x${string}`,
          delegatorCount: count,
        }))
        .sort((a, b) => b.delegatorCount - a.delegatorCount)

      setDelegates(entries)
    } catch {
      // Silently fail — marketplace is non-critical
      setDelegates([])
    } finally {
      setMarketplaceLoading(false)
    }
  }, [publicClient])

  const estimateGasWithBuffer = async (functionName: 'delegate' | 'undelegate', args?: readonly [`0x${string}`] | readonly []) => {
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

  useEffect(() => {
    if (mounted) {
      void loadDelegates()
    }
  }, [mounted, loadDelegates])

  const shortenAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)

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
  const delegateDisplay = typeof currentDelegate === 'string' && currentDelegate !== ZERO_ADDRESS
    ? shortenAddress(currentDelegate)
    : null
  const { data: proxyDelegationRegistry, isError: proxyDelegationError } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: DELEGATING_VOICE_CREDIT_PROXY_ABI,
    functionName: 'delegationRegistry',
    query: { enabled: VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS },
  })
  const delegationRegistryMatch =
    typeof proxyDelegationRegistry === 'string' &&
    proxyDelegationRegistry !== ZERO_ADDRESS &&
    proxyDelegationRegistry.toLowerCase() === DELEGATION_REGISTRY_ADDRESS.toLowerCase()
  const isDelegationEffective = isConfigured && !proxyDelegationError && delegationRegistryMatch
  const delegationEffectNote = isDelegationEffective
    ? t.governance.delegation.effectNote
    : t.governance.delegation.effectNoteLimited

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
      setError(t.header.wrongNetwork)
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
      if (address) {
        localStorage.setItem(storageKey.delegationChangedAt(address), String(Date.now()))
      }
      setShowDelegateSuccess(true)
      setTxStatus('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        setError(t.voteForm.errorRejected)
      } else {
        setError(t.governance.delegation.error)
      }
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
      setError(t.header.wrongNetwork)
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
      if (address) {
        localStorage.setItem(storageKey.delegationChangedAt(address), String(Date.now()))
      }
      setShowUndelegateSuccess(true)
      setTxStatus('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        setError(t.voteForm.errorRejected)
      } else {
        setError(t.governance.delegation.error)
      }
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
      <div className="flex items-center gap-3 mb-6">
        <a
          href="/vote"
          className="inline-flex items-center justify-center bg-black text-white text-xs font-bold px-4 py-2 border-2 border-black hover:bg-slate-800 transition-colors"
        >
          {t.governance.delegation.goToProposals}
        </a>
      </div>

      {isWrongNetwork && (
        <div className="bg-amber-50 border-2 border-amber-500 text-amber-700 p-3 mb-4 text-sm font-bold">
          {t.header.wrongNetwork}
        </div>
      )}

      {/* Delegation Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* My Delegation Status */}
        <div className="border-2 border-border-light dark:border-border-dark p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            {t.governance.delegation.myDelegation}
          </h2>
          {isDelegating ? (
            <>
              <div className="mb-3">
                <p className="text-[10px] text-slate-400 mb-1">{t.governance.delegation.delegatedTo}</p>
                <p className="font-mono text-sm font-bold break-all">
                  {delegateDisplay || '—'}
                </p>
              </div>
              <button
                onClick={handleUndelegate}
                disabled={isUndelegatingTx || (isConfirming && lastAction === 'undelegate')}
                className="w-full bg-red-500 text-white text-xs font-bold px-3 py-2 hover:bg-red-600 transition-colors"
              >
                {isUndelegatingTx || (isConfirming && lastAction === 'undelegate')
                  ? t.governance.delegation.undelegating
                  : t.governance.delegation.revokeDelegation}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">{t.governance.delegation.notDelegating}</p>
          )}
        </div>

        {/* Delegations Received */}
        <div className="border-2 border-border-light dark:border-border-dark p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            {t.governance.delegation.delegationsReceived}
          </h2>
          {delegatorList.length > 0 ? (
            <>
              <div className="mb-3">
                <p className="text-[10px] text-slate-400 mb-1">{t.governance.delegation.totalDelegators}</p>
                <p className="text-2xl font-display font-bold">{delegatorList.length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t.governance.delegation.delegatorsList}</p>
                {delegatorList.slice(0, 5).map((d, i) => (
                  <div key={i} className="text-[10px] font-mono text-slate-600 break-all">
                    {d as string}
                  </div>
                ))}
                {delegatorList.length > 5 && (
                  <p className="text-[10px] text-slate-400">
                    {t.governance.delegation.andMore.replace('{count}', String(delegatorList.length - 5))}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{t.governance.delegation.noDelegationsReceived}</p>
          )}
        </div>
      </div>

      {/* Delegation Effect Note */}
      <div className="bg-blue-50 border-2 border-blue-200 p-3 mb-6">
        <p className="text-xs text-blue-700">{delegationEffectNote}</p>
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

      {/* Delegate Marketplace */}
      {!isDelegating && (
        <div className="border-2 border-border-light dark:border-border-dark p-4 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            {t.governance.delegation.marketplace}
          </h2>
          <input
            type="text"
            value={marketplaceSearch}
            onChange={(e) => setMarketplaceSearch(e.target.value)}
            placeholder={t.governance.delegation.marketplaceSearch}
            className="w-full border-2 border-border-light dark:border-border-dark p-2 text-sm font-mono mb-3 focus:outline-none focus:border-primary"
          />
          {marketplaceLoading ? (
            <p className="text-xs text-slate-400">{t.governance.delegation.marketplaceLoading}</p>
          ) : filteredDelegates.length === 0 ? (
            <p className="text-xs text-slate-400">{t.governance.delegation.marketplaceEmpty}</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {filteredDelegates.map((d) => (
                  <div
                    key={d.address}
                    className="flex items-center justify-between border border-slate-200 p-2 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setDelegateAddress(d.address)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDelegateAddress(d.address) }}
                  >
                    <div>
                      <p className="text-xs font-mono text-slate-700">{shortenAddress(d.address)}</p>
                      <p className="text-[10px] text-slate-400">
                        {t.governance.delegation.marketplaceDelegators.replace('{count}', String(d.delegatorCount))}
                      </p>
                    </div>
                    <button
                      className="text-xs font-bold text-black border-2 border-black px-2 py-1 hover:bg-black hover:text-white transition-colors"
                      onClick={(e) => { e.stopPropagation(); setDelegateAddress(d.address) }}
                      tabIndex={-1}
                    >
                      {t.governance.delegation.selectDelegate}
                    </button>
                  </div>
              ))}
            </div>
          )}
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
