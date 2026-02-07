import { useState, useEffect, useCallback } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { PRIVATE_VOTING_ADDRESS, PRIVATE_VOTING_ABI } from '../contract'
import type { Proposal, ProposalPhase, ProposalStatus } from '../types'

export function useProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([])

  const { data: proposalCount, refetch: refetchProposalCount } = useReadContract({
    address: PRIVATE_VOTING_ADDRESS,
    abi: PRIVATE_VOTING_ABI,
    functionName: 'proposalCount',
  })

  const proposalCalls = proposalCount && Number(proposalCount) > 0
    ? Array.from({ length: Number(proposalCount) }, (_, i) => ({
        address: PRIVATE_VOTING_ADDRESS as `0x${string}`,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'getProposal' as const,
        args: [BigInt(i + 1)],
      }))
    : []

  const { data: proposalsData, refetch: refetchProposals } = useReadContracts({
    contracts: proposalCalls,
  })

  useEffect(() => {
    if (proposalsData && proposalsData.length > 0) {
      const loadedProposals: Proposal[] = proposalsData
        .filter((result) => result.status === 'success' && result.result !== undefined)
        .map((result) => {
          const data = result.result as [
            bigint, string, string, string, bigint, bigint, bigint,
            bigint, bigint, bigint, bigint, bigint, number
          ]
          const [
            id, title, description, proposer, merkleRoot, endTime, revealEndTime,
            forVotes, againstVotes, abstainVotes, totalCommitments, revealedVotes, phaseNum
          ] = data

          const now = Date.now()
          const endTimeMs = Number(endTime) * 1000
          const revealEndTimeMs = Number(revealEndTime) * 1000

          let phase: ProposalPhase
          if (phaseNum === 0 || now < endTimeMs) {
            phase = 'commit'
          } else if (phaseNum === 1 || now < revealEndTimeMs) {
            phase = 'reveal'
          } else {
            phase = 'ended'
          }

          let status: ProposalStatus
          if (phase === 'commit') {
            status = 'active'
          } else if (phase === 'reveal') {
            status = 'reveal'
          } else {
            status = Number(forVotes) > Number(againstVotes) ? 'passed' : 'defeated'
          }

          return {
            id: id.toString(),
            title,
            description,
            proposer,
            merkleRoot,
            endTime: new Date(endTimeMs),
            revealEndTime: new Date(revealEndTimeMs),
            forVotes: Number(forVotes),
            againstVotes: Number(againstVotes),
            abstainVotes: Number(abstainVotes),
            totalCommitments: Number(totalCommitments),
            revealedVotes: Number(revealedVotes),
            phase,
            status,
          }
        })
      setProposals(loadedProposals)
    }
  }, [proposalsData])

  const refreshProposals = useCallback(() => {
    refetchProposalCount()
    refetchProposals()
  }, [refetchProposalCount, refetchProposals])

  return {
    proposals,
    proposalCount,
    refetchProposals,
    refreshProposals,
  }
}
