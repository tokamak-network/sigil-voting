import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { PRIVATE_VOTING_ADDRESS, PRIVATE_VOTING_ABI } from '../contract'
import {
  getOrCreateKeyPairAsync,
  createTokenNoteAsync,
  getStoredNote,
  preloadCrypto,
  type KeyPair,
  type TokenNote,
} from '../zkproof'

const VOTING_POWER = 350n

export function useZkIdentity(address: string | undefined, isConnected: boolean) {
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null)
  const [tokenNote, setTokenNote] = useState<TokenNote | null>(null)
  const [isVoterRegistered, setIsVoterRegistered] = useState(false)
  const [currentAddress, setCurrentAddress] = useState<string | undefined>()

  const { data: isUserRegistered, refetch: refetchIsUserRegistered } = useReadContract({
    address: PRIVATE_VOTING_ADDRESS,
    abi: PRIVATE_VOTING_ABI,
    functionName: 'isVoterRegistered',
    args: tokenNote ? [tokenNote.noteHash] : undefined,
    query: { enabled: !!tokenNote && tokenNote.noteHash !== 0n },
  })

  const { refetch: refetchRegisteredVoters } = useReadContract({
    address: PRIVATE_VOTING_ADDRESS,
    abi: PRIVATE_VOTING_ABI,
    functionName: 'getRegisteredVoters',
  })

  // Pre-load crypto on mount
  useEffect(() => {
    preloadCrypto()
  }, [])

  // Reset ZK identity when wallet address changes
  useEffect(() => {
    if (address !== currentAddress) {
      setKeyPair(null)
      setTokenNote(null)
      setIsVoterRegistered(false)
      setCurrentAddress(address)
    }
  }, [address, currentAddress])

  // Initialize ZK identity on connect or address change
  useEffect(() => {
    if (isConnected && address && !keyPair) {
      const initIdentity = async () => {
        const kp = await getOrCreateKeyPairAsync(address)
        setKeyPair(kp)

        let note = getStoredNote(address)
        if (note && note.pkX === kp.pkX && note.pkY === kp.pkY) {
          // Note restored from storage
        } else {
          note = await createTokenNoteAsync(kp, VOTING_POWER, 1n, address)
        }
        setTokenNote(note)
      }
      initIdentity()
    }
  }, [isConnected, keyPair, address])

  // Update voter registration status
  useEffect(() => {
    if (isUserRegistered !== undefined) {
      setIsVoterRegistered(isUserRegistered as boolean)
    }
  }, [isUserRegistered])

  // Check if voter is already registered on mount/address change
  useEffect(() => {
    const checkRegistration = async () => {
      if (!tokenNote || tokenNote.noteHash === 0n) return
      const { data: alreadyRegistered } = await refetchIsUserRegistered()
      setIsVoterRegistered(alreadyRegistered as boolean || false)
    }
    checkRegistration()
  }, [tokenNote, refetchIsUserRegistered])

  return {
    keyPair,
    tokenNote,
    isVoterRegistered,
    setIsVoterRegistered,
    refetchRegisteredVoters,
    refetchIsUserRegistered,
    votingPower: VOTING_POWER,
  }
}
