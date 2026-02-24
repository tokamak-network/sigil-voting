/**
 * Typed wrapper for window.ethereum provider.
 * Centralizes the window cast to avoid repetition across components.
 */

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export function getEthereumProvider(): EthereumProvider | undefined {
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum
}
