import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from '../wagmi'
import type { Page } from '../types'
import { useTranslation } from '../i18n'

const shortenAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)
import { LanguageSwitcher } from './LanguageSwitcher'

interface HeaderProps {
  currentPage: Page
  setCurrentPage: (page: Page) => void
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void
}

export function Header({
  currentPage,
  setCurrentPage,
}: HeaderProps) {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { t } = useTranslation()

  const isCorrectChain = chainId === sepolia.id

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: sepolia.id })
    } catch (error) {
      console.error('Network switch failed:', error)
      if (window.ethereum) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          })
        } catch (switchError: unknown) {
          if (switchError && typeof switchError === 'object' && 'code' in switchError && switchError.code === 4902) {
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
    <header className="brutalist-header">
      <div className="brutalist-header-left">
        <button className="brutalist-logo" onClick={() => setCurrentPage('landing')} aria-label={t.header.home}>
          <div className="brutalist-logo-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 2 L35.32 11 L35.32 29 L20 38 L4.68 29 L4.68 11 Z" stroke="#000000" strokeWidth="2.5" fill="none"/>
              <path d="M20 6 L31.66 13 L31.66 27 L20 34 L8.34 27 L8.34 13 Z" stroke="#0052FF" strokeWidth="2" fill="none"/>
              <path d="M20 10 L28 20 L20 30 L12 20 Z" stroke="#000000" strokeWidth="2.5" fill="none"/>
              <circle cx="20" cy="20" r="3" fill="#0052FF"/>
            </svg>
          </div>
          <span className="brutalist-logo-text">SIGIL</span>
        </button>
        <nav className="brutalist-nav">
          <button
            className={`brutalist-nav-item ${currentPage === 'proposals' || currentPage === 'proposal-detail' ? 'active' : ''}`}
            onClick={() => setCurrentPage('proposals')}
          >
            {t.header.vote}
          </button>
        </nav>
      </div>

      <div className="brutalist-header-right">
        <LanguageSwitcher />
        {isConnected ? (
          <>
            {!isCorrectChain ? (
              <button className="brutalist-switch-btn" onClick={handleSwitchNetwork} disabled={isSwitching}>
                {isSwitching ? t.header.switching : t.header.wrongNetwork}
              </button>
            ) : (
              <div className="brutalist-wallet-info">
                <span>{shortenAddress(address!)}</span>
                <button className="brutalist-disconnect-btn" onClick={() => disconnect()} aria-label={t.header.disconnect}>
                  {t.header.disconnect}
                </button>
              </div>
            )}
          </>
        ) : (
          <button className="brutalist-connect-btn" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? t.header.connecting : t.header.connect}
          </button>
        )}
      </div>
    </header>
  )
}
