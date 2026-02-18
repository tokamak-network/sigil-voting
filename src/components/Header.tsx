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

  const isCorrectChain = chainId === sepolia.id
  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS
  const isLandingOrTech = currentPage === 'landing' || currentPage === 'technology'
  const showNewProposal = currentPage === 'proposals'

  const { data: voiceCreditsRaw } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: VOICE_CREDIT_PROXY_ABI,
    functionName: 'getVoiceCredits',
    args: address ? [address, '0x'] : undefined,
    query: { enabled: isConfigured && VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS && !!address, refetchInterval: 30000 },
  })
  const voiceCredits = voiceCreditsRaw !== undefined ? Number(voiceCreditsRaw) : 0

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
    <nav className="sticky top-0 z-50 px-6 py-4 bg-white border-b-2 border-black">
      <div className="w-full flex items-center justify-between">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentPage('landing')} className="flex items-center gap-3">
            <img src="/assets/symbol.svg" alt="SIGIL" className="w-10 h-10" />
            <span className="font-display font-bold text-2xl tracking-tighter uppercase">SIGIL</span>
          </button>
          <button
            onClick={() => setCurrentPage('technology')}
            className={`hidden md:block ml-4 text-xs font-bold uppercase tracking-wider transition-colors ${
              currentPage === 'technology' ? 'text-primary' : 'text-slate-500 hover:text-black'
            }`}
          >
            {t.technology.nav}
          </button>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-4">
          <LanguageSwitcher />

          {/* Balance + New Proposal (connected, in app pages) */}
          {isConnected && isCorrectChain && !isLandingOrTech && (
            <div className="hidden lg:flex items-center border-2 border-black bg-white p-2 gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase leading-none">{t.header.balance}</span>
                <span className="text-sm font-mono font-bold">{voiceCredits.toLocaleString()} {t.voteForm.credits}</span>
              </div>
              {showNewProposal && (
                <>
                  <div className="h-8 w-[1px] bg-slate-200"></div>
                  <button
                    onClick={() => setCurrentPage('create-proposal')}
                    className="bg-black text-white px-4 py-2 text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    {t.header.newProposal}
                  </button>
                </>
              )}
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

          {/* Wallet address (connected) */}
          {isConnected && isCorrectChain && (
            <button
              onClick={() => disconnect()}
              className="flex items-center border-2 border-black hover:border-red-500 transition-colors group"
              title={t.header.disconnect}
            >
              <div className="px-3 py-1 bg-black text-white text-[10px] font-bold group-hover:bg-red-500 transition-colors">{shortenAddress(address!)}</div>
            </button>
          )}

          {/* Launch App (landing / technology pages) */}
          {isLandingOrTech && (
            <button
              className="bg-primary text-white px-6 py-2 border-2 border-black font-bold text-xs uppercase tracking-widest hover:translate-x-[2px] hover:translate-y-[2px] transition-transform"
              onClick={() => setCurrentPage('proposals')}
            >
              {t.landing.enterApp}
            </button>
          )}

          {/* Connect wallet (not connected, in app pages) */}
          {!isConnected && !isLandingOrTech && (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-primary text-white px-6 py-2 border-2 border-black font-bold text-xs uppercase tracking-widest hover:translate-x-[2px] hover:translate-y-[2px] transition-transform"
            >
              {isConnecting ? t.header.connecting : t.header.connect}
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
