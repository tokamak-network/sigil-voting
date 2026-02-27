/**
 * Global EIP-1193 provider registry.
 * Privy embedded wallet provider is set via useProviderSync hook.
 * Falls back to window.ethereum (MetaMask etc.) if no active provider.
 */

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

let _activeProvider: EthereumProvider | null = null

export function setActiveProvider(provider: EthereumProvider | null): void {
  _activeProvider = provider
}

export function getEthereumProvider(): EthereumProvider | undefined {
  if (_activeProvider) return _activeProvider
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum
}
