import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain, useReadContract } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from '../wagmi'
import type { Page } from '../types'
import { useTranslation } from '../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import {
  MACI_V2_ADDRESS,
  VOICE_CREDIT_PROXY_ADDRESS,
  VOICE_CREDIT_PROXY_ABI,
} from '../contractV2'

const shortenAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

interface HeaderProps {
  currentPage: Page
  setCurrentPage: (page: Page) => void
}

export function Header({ currentPage, setCurrentPage }: HeaderProps) {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { t } = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const disconnectRef = useRef<HTMLDivElement>(null)

  const isCorrectChain = chainId === sepolia.id
  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS

  const { data: voiceCreditsRaw } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: VOICE_CREDIT_PROXY_ABI,
    functionName: 'getVoiceCredits',
    args: address ? [address, '0x'] : undefined,
    query: { enabled: isConfigured && VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS && !!address, refetchInterval: 30000 },
  })
  const voiceCredits = voiceCreditsRaw !== undefined ? Number(voiceCreditsRaw) : 0

  // Close disconnect confirm on outside click
  useEffect(() => {
    if (!showDisconnectConfirm) return
    const handleClick = (e: MouseEvent) => {
      if (disconnectRef.current && !disconnectRef.current.contains(e.target as Node)) {
        setShowDisconnectConfirm(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDisconnectConfirm])

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: sepolia.id })
    } catch {
      if (window.ethereum) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          })
        } catch (switchError: unknown) {
          if (switchError && typeof switchError === 'object' && 'code' in switchError && (switchError as any).code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia',
                nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              }],
            })
          }
        }
      }
    }
  }

  const handleConnect = () => connect({ connector: injected() })

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-background-dark/80 backdrop-blur-md border-b-2 border-border-light dark:border-border-dark">
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        {/* Left: Brand + Testnet badge */}
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPage('landing')} className="flex items-center gap-2">
            <img src="/assets/symbol.svg" alt="SIGIL" className="w-8 h-8" />
            <span className="font-display font-extrabold text-xl tracking-tighter uppercase">SIGIL</span>
          </button>
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider border border-amber-300 rounded-sm">
            {t.header.testnet}
          </span>
        </div>

        {/* Center: Nav (desktop) */}
        <nav className="hidden md:flex items-center gap-6">
          <button
            onClick={() => setCurrentPage('proposals')}
            className={`font-display font-bold text-sm uppercase tracking-wide transition-colors ${currentPage === 'proposals' || currentPage === 'proposal-detail' || currentPage === 'create-proposal' ? 'text-primary' : 'text-slate-500 hover:text-black dark:hover:text-white'}`}
          >
            {t.header.vote}
          </button>
          <button
            onClick={() => setCurrentPage('technology')}
            className={`font-display font-bold text-sm uppercase tracking-wide transition-colors ${currentPage === 'technology' ? 'text-primary' : 'text-slate-500 hover:text-black dark:hover:text-white'}`}
          >
            {t.header.technology}
          </button>
        </nav>

        {/* Right: Controls */}
        <div className="flex items-center gap-2 md:gap-4">
          <LanguageSwitcher />

          {/* Mobile balance (connected) */}
          {isConnected && isCorrectChain && (
            <span className="lg:hidden text-xs font-display font-bold text-slate-600">
              {voiceCredits.toLocaleString()} {t.voteForm.credits}
            </span>
          )}

          {/* Balance + New Proposal (connected, desktop) */}
          {isConnected && isCorrectChain && (
            <div className="hidden lg:flex items-center border-2 border-border-light dark:border-border-dark bg-white p-2 gap-4">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-500 uppercase leading-none">{t.header.balance}</span>
                <span className="text-sm font-display font-bold">{voiceCredits.toLocaleString()} {t.voteForm.credits}</span>
              </div>
              <div className="h-8 w-[1px] bg-slate-200"></div>
              <button
                onClick={() => setCurrentPage('create-proposal')}
                className="bg-black text-white px-4 py-2 text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                {t.header.newProposal}
              </button>
            </div>
          )}

          {/* Wrong chain warning */}
          {isConnected && !isCorrectChain && (
            <button
              onClick={handleSwitchNetwork}
              disabled={isSwitching}
              className="bg-red-500 text-white px-4 py-2 text-xs font-bold border-2 border-black"
            >
              {isSwitching ? t.header.switching : t.header.wrongNetwork}
            </button>
          )}

          {/* Wallet address with disconnect confirm (connected) */}
          {isConnected && isCorrectChain && (
            <div className="relative" ref={disconnectRef}>
              <button
                onClick={() => setShowDisconnectConfirm(!showDisconnectConfirm)}
                className="flex items-center border-2 border-border-light dark:border-border-dark hover:border-red-500 transition-colors group"
                title={t.header.disconnect}
              >
                <div className="px-3 py-1 bg-black text-white text-xs font-bold group-hover:bg-red-500 transition-colors">{shortenAddress(address!)}</div>
              </button>
              {showDisconnectConfirm && (
                <div className="absolute right-0 top-full mt-2 bg-white border-2 border-black p-3 min-w-[200px] z-50" style={{ boxShadow: '4px 4px 0px 0px rgba(0, 0, 0, 1)' }}>
                  <p className="text-xs font-bold text-slate-700 mb-3">{t.header.disconnectConfirm}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { disconnect(); setShowDisconnectConfirm(false); }}
                      className="flex-1 bg-red-500 text-white text-xs font-bold py-1.5 px-3 hover:bg-red-600 transition-colors"
                    >
                      {t.header.disconnectYes}
                    </button>
                    <button
                      onClick={() => setShowDisconnectConfirm(false)}
                      className="flex-1 bg-slate-100 text-black text-xs font-bold py-1.5 px-3 hover:bg-slate-200 transition-colors border border-slate-300"
                    >
                      {t.header.disconnectNo}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Connect wallet (not connected) */}
          {!isConnected && (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-primary text-white font-display font-bold px-4 py-2 hover:translate-x-1 hover:-translate-y-1 transition-transform border-2 border-black"
            >
              {isConnecting ? t.header.connecting : t.header.connect.toUpperCase()}
            </button>
          )}

          {/* Mobile hamburger menu */}
          <button
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={t.header.menu}
          >
            <span className={`block w-5 h-0.5 bg-black transition-transform ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-0.5 bg-black transition-opacity ${mobileMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-black transition-transform ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 top-16 bg-black/30 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
          <nav className="absolute left-0 right-0 top-16 bg-white border-b-2 border-black z-50 md:hidden flex flex-col">
            <button
              onClick={() => { setCurrentPage('proposals'); setMobileMenuOpen(false); }}
              className={`px-6 py-4 text-left font-display font-bold text-sm uppercase tracking-wide border-b border-slate-100 ${currentPage === 'proposals' || currentPage === 'proposal-detail' || currentPage === 'create-proposal' ? 'text-primary bg-blue-50' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {t.header.vote}
            </button>
            <button
              onClick={() => { setCurrentPage('technology'); setMobileMenuOpen(false); }}
              className={`px-6 py-4 text-left font-display font-bold text-sm uppercase tracking-wide ${currentPage === 'technology' ? 'text-primary bg-blue-50' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {t.header.technology}
            </button>
          </nav>
        </>
      )}
    </header>
  )
}
