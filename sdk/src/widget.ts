/**
 * @sigil/sdk/widget — Embeddable voting widget for any website
 *
 * Usage (HTML embed):
 *   <script src="https://unpkg.com/@sigil/sdk/dist/widget.js"></script>
 *   <div id="sigil-vote" data-maci="0x70e5..." data-poll="0"></div>
 *
 * Usage (React):
 *   import { SigilWidget } from '@sigil/sdk/widget';
 *   <SigilWidget maciAddress="0x70e5..." pollId={0} />
 *
 * The widget provides:
 *   - Wallet connection (WalletConnect / injected)
 *   - Auto-registration
 *   - Vote casting with quadratic cost display
 *   - Real-time results (after finalization)
 *   - i18n (English / Korean)
 */

export interface WidgetConfig {
  /** MACI contract address */
  maciAddress: string;
  /** Poll ID to display */
  pollId: number;
  /** Target element ID or HTMLElement */
  target?: string | HTMLElement;
  /** Chain ID (default: 11155111 for Sepolia) */
  chainId?: number;
  /** Theme: 'light' | 'dark' | 'auto' */
  theme?: 'light' | 'dark' | 'auto';
  /** Language: 'en' | 'ko' */
  lang?: 'en' | 'ko';
  /** Callback when vote is submitted */
  onVote?: (receipt: { txHash: string; choice: string; numVotes: number }) => void;
  /** Callback when results are available */
  onResults?: (results: { forVotes: bigint; againstVotes: bigint }) => void;
}

/**
 * Mount the SIGIL voting widget
 *
 * @example
 * mountSigilWidget({
 *   maciAddress: '0x70e53036f8c00ce3A20e56e39329a8895704d9cd',
 *   pollId: 0,
 *   target: '#vote-container',
 *   theme: 'dark',
 *   lang: 'en',
 * });
 */
export function mountSigilWidget(_config: WidgetConfig): { unmount: () => void } {
  // TODO: Implement React-based widget renderer
  // This will render the VoteFormV2 + ResultsDisplay components
  // in the target element with its own React root

  console.warn('@sigil/sdk/widget: Widget rendering not yet implemented. Coming soon.');

  return {
    unmount: () => {
      // Clean up React root
    },
  };
}

/**
 * React component for embedding (when using React)
 * Will be implemented as a wrapper around the core voting components
 */
export const SigilWidget = '_REACT_COMPONENT_PLACEHOLDER_';
