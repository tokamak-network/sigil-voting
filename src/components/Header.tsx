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
    <header className="brutalist-header">
      <div className="brutalist-header-left">
        <div className="brutalist-logo" onClick={() => setCurrentPage('landing')}>
          <div className="brutalist-logo-icon">
            <span className="material-symbols-outlined">fingerprint</span>
          </div>
          <span className="brutalist-logo-text">ZK-VOTING</span>
        </div>
        <nav className="brutalist-nav">
          <button
            className={`brutalist-nav-item ${currentPage === 'proposals' ? 'active' : ''}`}
            onClick={() => setCurrentPage('proposals')}
          >
            Proposals
          </button>
        </nav>
      </div>

      <div className="brutalist-header-right">
        {isConnected ? (
          <>
            {!isCorrectChain ? (
              <button className="brutalist-switch-btn" onClick={handleSwitchNetwork} disabled={isSwitching}>
                {isSwitching ? 'Switching...' : 'Wrong Network'}
              </button>
            ) : (
              <div className="brutalist-wallet-info" onClick={() => disconnect()}>
                <span>{shortenAddress(address!)}</span>
              </div>
            )}
          </>
        ) : (
          <button className="brutalist-connect-btn" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? '...' : 'Connect'}
          </button>
        )}
      </div>
    </header>
  )
}
