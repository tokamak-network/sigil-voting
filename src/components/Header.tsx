import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from '../wagmi'
import type { Page } from '../types'
import { shortenAddress } from '../utils'

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
    <header className="header">
      <div className="header-left">
        <div className="logo" onClick={() => setCurrentPage('landing')}>
          <span className="logo-icon">🗳️</span>
          <span className="logo-text">ZK Vote</span>
        </div>
        <nav className="nav">
          <button
            className={`nav-item ${currentPage === 'landing' ? 'active' : ''}`}
            onClick={() => setCurrentPage('landing')}
          >
            Home
          </button>
          <button
            className={`nav-item ${currentPage === 'proposals' ? 'active' : ''}`}
            onClick={() => setCurrentPage('proposals')}
          >
            Proposals
          </button>
        </nav>
      </div>

      <div className="header-right">
        {isConnected ? (
          <div className="wallet-connected">
            <span className={`chain-badge ${isCorrectChain ? 'correct' : 'wrong'}`}>
              {isCorrectChain ? 'Sepolia' : 'Wrong Network'}
            </span>
            {!isCorrectChain && (
              <button className="switch-btn" onClick={handleSwitchNetwork} disabled={isSwitching}>
                {isSwitching ? 'Switching...' : 'Switch'}
              </button>
            )}
            <span className="wallet-address">{shortenAddress(address!)}</span>
            <button className="disconnect-btn" onClick={() => disconnect()}>×</button>
          </div>
        ) : (
          <button className="connect-btn" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </header>
  )
}
