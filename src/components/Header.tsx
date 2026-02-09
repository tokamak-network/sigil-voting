import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from '../wagmi'
import { PRIVATE_VOTING_ADDRESS, PRIVATE_VOTING_ABI } from '../contract'
import { formatBigInt, getKeyInfo, type KeyPair, type TokenNote } from '../zkproof'
import type { Page } from '../types'
import { shortenAddress } from '../utils'

interface HeaderProps {
  currentPage: Page
  setCurrentPage: (page: Page) => void
  keyPair: KeyPair | null
  tokenNote: TokenNote | null
  isVoterRegistered: boolean
  isRegisteringVoter: boolean
  setIsRegisteringVoter: (value: boolean) => void
  setIsVoterRegistered: (value: boolean) => void
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
}

export function Header({
  currentPage,
  setCurrentPage,
  keyPair,
  tokenNote,
  isVoterRegistered,
  isRegisteringVoter,
  setIsRegisteringVoter,
  setIsVoterRegistered,
  showToast,
}: HeaderProps) {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

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

  const handleRegisterVoter = async () => {
    if (!tokenNote || tokenNote.noteHash === 0n) return
    setIsRegisteringVoter(true)
    try {
      await writeContractAsync({
        address: PRIVATE_VOTING_ADDRESS,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'registerVoter',
        args: [tokenNote.noteHash],
        gas: BigInt(100000),
      })
      setIsVoterRegistered(true)
      showToast('Voter registered successfully!', 'success')
    } catch (error) {
      if (!(error as Error).message?.includes('User rejected')) {
        showToast('Registration failed', 'error')
      }
    } finally {
      setIsRegisteringVoter(false)
    }
  }

  const handleResetIdentity = () => {
    if (confirm('ZK Identity 초기화하시겠습니까?')) {
      localStorage.clear()
      window.location.reload()
    }
  }

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo" onClick={() => setCurrentPage('landing')}>
          <span className="logo-icon">🗳️</span>
          <span className="logo-text">ZK Vote</span>
          <span className="logo-badge">D1 + D2</span>
        </div>
        <nav className="nav">
          <button className={`nav-item ${currentPage === 'landing' ? 'active' : ''}`} onClick={() => setCurrentPage('landing')}>
            Home
          </button>
          <button className={`nav-item ${currentPage === 'proposals' ? 'active' : ''}`} onClick={() => setCurrentPage('proposals')}>
            D1: Private Vote
          </button>
          <button className={`nav-item d2-tab ${currentPage === 'quadratic-voting' ? 'active' : ''}`} onClick={() => setCurrentPage('quadratic-voting')}>
            D2: Quadratic
          </button>
        </nav>
      </div>

      <div className="header-right">
        {isConnected && keyPair && (
          <div className="identity-badge" title={`Public Key: ${formatBigInt(keyPair.pkX)}`}>
            <span className="identity-icon">🔑</span>
            <span className="identity-text">{getKeyInfo(keyPair).shortPk}</span>
            {isVoterRegistered && <span className="registered-badge" title="Registered Voter">✓</span>}
          </div>
        )}
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
            <div className="wallet-info">
              <span className="voting-power-badge">{tokenNote ? tokenNote.noteValue.toString() : '0'} VP</span>
              <span className="wallet-address">{shortenAddress(address!)}</span>
            </div>
            <button className="disconnect-btn" onClick={() => disconnect()}>×</button>
            <button className="reset-btn" title="Reset ZK Identity" onClick={handleResetIdentity}>↺</button>
            {!isVoterRegistered && !isRegisteringVoter && tokenNote && tokenNote.noteHash !== 0n && (
              <button className="register-voter-btn" onClick={handleRegisterVoter}>
                Register to Vote
              </button>
            )}
            {isRegisteringVoter && (
              <span className="registering-status">Registering...</span>
            )}
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
