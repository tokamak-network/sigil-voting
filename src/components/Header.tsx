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
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void
}

export function Header({ currentPage, setCurrentPage }: HeaderProps) {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect: _disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { t } = useTranslation()

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

  const showNewProposal = currentPage === 'proposals'

  return (
    <nav className="sticky top-0 z-50 px-6 py-4 bg-white border-b-2 border-black">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left: Logo + Badge */}
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPage('landing')} className="flex items-center gap-2">
            <img src="/assets/symbol.svg" alt="SIGIL" className="w-8 h-8" />
            <span className="font-display font-bold text-2xl tracking-tighter uppercase italic">SIGIL</span>
          </button>
          {(currentPage === 'proposals' || currentPage === 'proposal-detail') && (
            <span className="hidden md:block ml-4 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 border border-primary/20">PROPOSALS</span>
          )}
        </div>

        {/* Right: Balance + New Proposal + Wallet + Language */}
        <div className="flex items-center gap-4">
          <LanguageSwitcher />

          {isConnected && isCorrectChain && (
            <>
              {/* Balance + New Proposal */}
              <div className="hidden lg:flex items-center border-2 border-black bg-white p-2 gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase leading-none">Available Balance</span>
                  <span className="text-sm font-mono font-bold">{voiceCredits.toLocaleString()} Credits</span>
                </div>
                {showNewProposal && (
                  <>
                    <div className="h-8 w-[1px] bg-slate-200"></div>
                    <button
                      onClick={() => setCurrentPage('create-proposal')}
                      className="bg-black text-white px-4 py-2 text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      NEW PROPOSAL
                    </button>
                  </>
                )}
              </div>

              {/* Wallet Address */}
              <div className="flex items-center border-2 border-black">
                <div className="px-3 py-1 bg-black text-white text-[10px] font-bold">{shortenAddress(address!)}</div>
              </div>
            </>
          )}

          {isConnected && !isCorrectChain && (
            <button
              onClick={handleSwitchNetwork}
              disabled={isSwitching}
              className="bg-red-500 text-white px-4 py-2 text-xs font-bold border-2 border-black"
            >
              {isSwitching ? t.header.switching : t.header.wrongNetwork}
            </button>
          )}

          {!isConnected && (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-primary text-white px-6 py-2 text-xs font-bold border-2 border-black hover:bg-blue-600 transition-colors"
            >
              {isConnecting ? t.header.connecting : t.header.connect}
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
