/**
 * sigil-sdk/react — React component wrapper for SIGIL voting widget.
 *
 * Wraps the framework-agnostic mountSigilWidget with proper React lifecycle.
 * Requires React as a peer dependency.
 *
 * Usage:
 *   import { SigilVoteWidget } from '@sigil/sdk/react';
 *
 *   function App() {
 *     return (
 *       <SigilVoteWidget
 *         maciAddress="0x..."
 *         pollId={0}
 *         onVoteSubmitted={(receipt) => console.log('Voted!', receipt)}
 *       />
 *     );
 *   }
 */

import { useRef, useEffect, type CSSProperties } from 'react';
import { mountSigilWidget, type WidgetHandle } from './widget.js';
import type { PollResults } from './types.js';
import type { ethers } from 'ethers';

/**
 * Props for the SigilVoteWidget React component.
 */
export interface SigilVoteWidgetProps {
  /** MACI contract address */
  maciAddress: string;
  /** Poll ID to display */
  pollId: number;
  /** Ethereum chain ID (default: 11155111 = Sepolia) */
  chainId?: number;
  /** Theme: 'light' | 'dark' | 'auto' (default: 'auto') */
  theme?: 'light' | 'dark' | 'auto';
  /** Language: 'en' | 'ko' (default: 'en') */
  lang?: 'en' | 'ko';
  /** Ethers provider (if not using injected wallet) */
  provider?: ethers.Provider;
  /** Ethers signer (if not using injected wallet) */
  signer?: ethers.Signer;
  /** Coordinator public key override [X, Y] */
  coordinatorPubKey?: [bigint, bigint];
  /** Callback when vote is submitted */
  onVoteSubmitted?: (receipt: { txHash: string; choice: string; numVotes: number }) => void;
  /** Callback when results are available */
  onResults?: (results: PollResults) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Additional CSS class name for the container */
  className?: string;
  /** Additional inline styles for the container */
  style?: CSSProperties;
}

/**
 * SigilVoteWidget — React component for embedding SIGIL voting UI.
 *
 * Handles key management internally via the SDK. Wraps the framework-agnostic
 * mountSigilWidget with proper React lifecycle (mount/unmount).
 *
 * The widget renders a complete voting interface including:
 * - Wallet connection
 * - Vote choice selection (For / Against / Abstain)
 * - Quadratic vote weight slider
 * - Results display (when poll is finalized)
 * - Privacy and anti-collusion indicators
 */
export function SigilVoteWidget(props: SigilVoteWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<WidgetHandle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up any previously mounted widget
    if (handleRef.current) {
      handleRef.current.unmount();
      handleRef.current = null;
    }

    // Mount the widget into the container div
    handleRef.current = mountSigilWidget({
      maciAddress: props.maciAddress,
      pollId: props.pollId,
      target: containerRef.current,
      chainId: props.chainId,
      theme: props.theme,
      lang: props.lang,
      provider: props.provider,
      signer: props.signer,
      onVote: props.onVoteSubmitted,
      onResults: props.onResults,
      onError: props.onError,
    });

    // Cleanup on unmount
    return () => {
      handleRef.current?.unmount();
      handleRef.current = null;
    };
  }, [
    props.maciAddress,
    props.pollId,
    props.chainId,
    props.theme,
    props.lang,
    props.provider,
    props.signer,
  ]);

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={props.style}
      data-sigil-react-widget="true"
    />
  );
}

/**
 * Hook for imperative control of the SIGIL widget.
 *
 * Returns a ref and handle for mounting/refreshing/unmounting the widget
 * programmatically.
 *
 * Usage:
 *   const { ref, handle } = useSigilWidget({
 *     maciAddress: '0x...',
 *     pollId: 0,
 *   });
 *
 *   // Force refresh
 *   handle.current?.refresh();
 *
 *   return <div ref={ref} />;
 */
export function useSigilWidget(config: Omit<SigilVoteWidgetProps, 'className' | 'style'>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const handle = useRef<WidgetHandle | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    if (handle.current) {
      handle.current.unmount();
      handle.current = null;
    }

    handle.current = mountSigilWidget({
      maciAddress: config.maciAddress,
      pollId: config.pollId,
      target: ref.current,
      chainId: config.chainId,
      theme: config.theme,
      lang: config.lang,
      provider: config.provider,
      signer: config.signer,
      onVote: config.onVoteSubmitted,
      onResults: config.onResults,
      onError: config.onError,
    });

    return () => {
      handle.current?.unmount();
      handle.current = null;
    };
  }, [
    config.maciAddress,
    config.pollId,
    config.chainId,
    config.theme,
    config.lang,
    config.provider,
    config.signer,
  ]);

  return { ref, handle };
}
