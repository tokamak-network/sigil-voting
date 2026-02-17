export type Page = 'landing' | 'proposals' | 'proposal-detail' | 'create-proposal' | 'vote-submitted' | 'technology'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}
