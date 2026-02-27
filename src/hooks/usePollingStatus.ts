/**
 * usePollingStatus - Real-time vote status polling hook
 *
 * Automatically polls on-chain status every 15 seconds during processing/tallying phases.
 * Transitions between states: merging → processing → tallying → results.
 * Stops polling when results are finalized.
 */

import { useState, useEffect } from 'react';
import { useReadContracts } from 'wagmi';
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

  // Batch all 4 status reads into a single multicall
  const shouldPoll = enabled && !isVotingOpen;
  const { data: results } = useReadContracts({
    contracts: [
      {
        address: pollAddress!,
        abi: POLL_ABI,
        functionName: 'stateAqMerged',
      },
      {
        address: pollAddress!,
        abi: POLL_ABI,
        functionName: 'messageAqMerged',
      },
      {
        address: messageProcessorAddress!,
        abi: MESSAGE_PROCESSOR_ABI,
        functionName: 'processingComplete',
      },
      {
        address: tallyAddress!,
        abi: TALLY_ABI,
        functionName: 'tallyVerified',
      },
    ],
    query: {
      enabled: shouldPoll && hasValidPoll,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const stateAqMerged = results?.[0]?.status === 'success' ? results[0].result : undefined;
  const messageAqMerged = results?.[1]?.status === 'success' ? results[1].result : undefined;
  const processingComplete = hasValidMp && results?.[2]?.status === 'success' ? results[2].result : undefined;
  const tallyVerified = hasValidTally && results?.[3]?.status === 'success' ? results[3].result : undefined;

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
