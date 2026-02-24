/**
 * usePollingStatus - Real-time vote status polling hook
 *
 * Automatically polls on-chain status every 15 seconds during processing/tallying phases.
 * Transitions between states: merging → processing → tallying → results.
 * Stops polling when results are finalized.
 */

import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { POLL_ABI, MESSAGE_PROCESSOR_ABI, TALLY_ABI } from '../contractV2';

export type VotePhase = 'voting' | 'merging' | 'processing' | 'tallying' | 'finalized' | 'unknown';

interface UsePollingStatusParams {
  pollAddress?: `0x${string}`;
  messageProcessorAddress?: `0x${string}`;
  tallyAddress?: `0x${string}`;
  isVotingOpen?: boolean;
  enabled?: boolean;
}

interface UsePollingStatusResult {
  phase: VotePhase;
  isPolling: boolean;
  stateAqMerged?: boolean;
  messageAqMerged?: boolean;
  processingComplete?: boolean;
  tallyVerified?: boolean;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const POLL_INTERVAL_MS = 15000; // 15 seconds

export function usePollingStatus({
  pollAddress,
  messageProcessorAddress,
  tallyAddress,
  isVotingOpen,
  enabled = true,
}: UsePollingStatusParams): UsePollingStatusResult {
  const [isPolling, setIsPolling] = useState(false);

  const hasValidPoll = !!pollAddress && pollAddress !== ZERO_ADDRESS;
  const hasValidMp = !!messageProcessorAddress && messageProcessorAddress !== ZERO_ADDRESS;
  const hasValidTally = !!tallyAddress && tallyAddress !== ZERO_ADDRESS;

  // Poll state: stateAqMerged and messageAqMerged
  const { data: stateAqMerged } = useReadContract({
    address: pollAddress!,
    abi: POLL_ABI,
    functionName: 'stateAqMerged',
    query: {
      enabled: enabled && hasValidPoll && !isVotingOpen,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const { data: messageAqMerged } = useReadContract({
    address: pollAddress!,
    abi: POLL_ABI,
    functionName: 'messageAqMerged',
    query: {
      enabled: enabled && hasValidPoll && !isVotingOpen,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  // MessageProcessor state: processingComplete
  const { data: processingComplete } = useReadContract({
    address: messageProcessorAddress!,
    abi: MESSAGE_PROCESSOR_ABI,
    functionName: 'processingComplete',
    query: {
      enabled: enabled && hasValidMp && !isVotingOpen,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  // Tally state: tallyVerified
  const { data: tallyVerified } = useReadContract({
    address: tallyAddress!,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
    query: {
      enabled: enabled && hasValidTally && !isVotingOpen,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  // Determine current phase
  const phase: VotePhase = (() => {
    if (isVotingOpen) return 'voting';
    if (tallyVerified === true) return 'finalized';
    if (processingComplete === true) return 'tallying';
    if (stateAqMerged === true && messageAqMerged === true) return 'processing';
    if (!isVotingOpen) return 'merging';
    return 'unknown';
  })();

  // Update polling state
  useEffect(() => {
    if (!enabled || isVotingOpen || tallyVerified === true) {
      setIsPolling(false);
    } else if (phase === 'merging' || phase === 'processing' || phase === 'tallying') {
      setIsPolling(true);
    } else {
      setIsPolling(false);
    }
  }, [enabled, isVotingOpen, tallyVerified, phase]);

  return {
    phase,
    isPolling,
    stateAqMerged: stateAqMerged === true,
    messageAqMerged: messageAqMerged === true,
    processingComplete: processingComplete === true,
    tallyVerified: tallyVerified === true,
  };
}
