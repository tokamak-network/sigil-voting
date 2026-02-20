/**
 * KeyManager.test.tsx - EdDSA Key Management UI tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../helpers/render'

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    isConnected: true,
  }),
  usePublicClient: () => ({
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
  }),
  useConnect: () => ({ connect: vi.fn(), isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  useReadContract: () => ({ data: undefined }),
  WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../src/contractV2', () => ({
  MACI_V2_ADDRESS: '0xABCDEF1234567890abcdef1234567890abcdef12',
  POLL_ABI: [],
}))

vi.mock('../../src/writeHelper', () => ({
  writeContract: vi.fn().mockResolvedValue('0xtxhash'),
}))

vi.mock('../../src/crypto/preload', () => ({
  preloadCrypto: vi.fn().mockResolvedValue({
    derivePrivateKey: vi.fn().mockReturnValue(123n),
    eddsaDerivePublicKey: vi.fn().mockResolvedValue([456n, 789n]),
    generateEphemeralKeyPair: vi.fn().mockResolvedValue({ sk: 1n, pubKey: [2n, 3n] }),
    generateECDHSharedKey: vi.fn().mockResolvedValue(999n),
    poseidonEncrypt: vi.fn().mockResolvedValue([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n]),
    eddsaSign: vi.fn().mockResolvedValue({ R8: [100n, 200n], S: 300n }),
    buildPoseidon: vi.fn().mockResolvedValue({
      F: { e: (v: bigint) => v, toObject: (v: bigint) => v },
      _: vi.fn().mockReturnValue(0n),
    }),
    loadEncrypted: vi.fn().mockResolvedValue(null),
    storeEncrypted: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { KeyManager } from '../../src/components/voting/KeyManager'

describe('KeyManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  const defaultProps = {
    pollId: 0,
    coordinatorPubKeyX: 123n,
    coordinatorPubKeyY: 456n,
    pollAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
    isRegistered: true,
  }

  it('renders key manager section', () => {
    renderWithProviders(<KeyManager {...defaultProps} />)
    // Uses i18n key: keyManager.title
    const section = screen.getByRole('button', { name: /info/i })
    expect(section).toBeInTheDocument()
  })

  it('shows "no key" message when not registered', () => {
    const { container } = renderWithProviders(<KeyManager {...defaultProps} isRegistered={false} />)
    // When not registered & no key, noKeyReason text should appear
    const noKeySection = container.querySelectorAll('.text-xs.text-slate-400, .text-xs.text-slate-500')
    expect(noKeySection.length).toBeGreaterThan(0)
  })

  it('shows key active status when key is in localStorage', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678'
    localStorage.setItem(
      `maci-ABCDEF-pubkey-${addr}-0`,
      JSON.stringify(['123', '456']),
    )
    renderWithProviders(<KeyManager {...defaultProps} />)
    // Should show "verified_user" icon (key active state)
    const verifiedIcon = document.querySelector('[aria-hidden="true"]')
    expect(verifiedIcon).toBeInTheDocument()
  })

  it('shows confirmation panel when change key button clicked', () => {
    renderWithProviders(<KeyManager {...defaultProps} />)
    // Find the "change key" link-style button (underline class)
    const allButtons = screen.getAllByRole('button')
    const changeBtn = allButtons.find((b) => b.className.includes('underline'))
    expect(changeBtn).toBeTruthy()
    fireEvent.click(changeBtn!)
    // After click, warning message should appear (amber panel)
    const warningPanel = document.querySelector('.bg-amber-50')
    expect(warningPanel).toBeInTheDocument()
  })

  it('shows tooltip when help button clicked', () => {
    renderWithProviders(<KeyManager {...defaultProps} />)
    const helpBtn = screen.getByRole('button', { name: /info/i })
    fireEvent.click(helpBtn)
    // Tooltip should now be visible
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })

  it('hides tooltip on second click', () => {
    renderWithProviders(<KeyManager {...defaultProps} />)
    const helpBtn = screen.getByRole('button', { name: /info/i })
    fireEvent.click(helpBtn) // show
    fireEvent.click(helpBtn) // hide
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
