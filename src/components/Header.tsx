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
    } catch {
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
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 3 L34 12 L34 28 L20 37 L6 28 L6 12 Z" stroke="#000000" strokeWidth="2.8" fill="none" strokeLinejoin="round"/>
              <path d="M20 8 L30.5 14 L30.5 26 L20 32 L9.5 26 L9.5 14 Z" stroke="#0052FF" strokeWidth="2.2" fill="none" strokeLinejoin="round"/>
              <path d="M20 12 L27 20 L20 28 L13 20 Z" stroke="#000000" strokeWidth="2.8" fill="none" strokeLinejoin="round"/>
              <circle cx="20" cy="20" r="3.2" fill="#0052FF"/>
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
