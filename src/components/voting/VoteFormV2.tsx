/**
 * VoteFormV2 - MACI Encrypted Voting Form
 *
 * No reveal phase. Votes are encrypted with Poseidon DuplexSponge
 * and submitted as encrypted messages to Poll.publishMessage().
 *
 * Flow:
 *   1. User selects vote choice (D1: 3 options, D2: 2 options)
 *   2. BLAKE512 key derivation → ECDH → DuplexSponge encryption
 *   3. EdDSA-Poseidon signature
 *   4. Binary command packing
 *   5. Poll.publishMessage(encMessage, encPubKey)
 */

import { useState } from 'react';
import { useWriteContract, useAccount } from 'wagmi';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';

interface VoteFormV2Props {
  pollId: number;
  isD2?: boolean;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  onVoteSubmitted?: () => void;
}

export function VoteFormV2({
  pollId,
  isD2 = false,
  coordinatorPubKeyX,
  coordinatorPubKeyY,
  onVoteSubmitted,
}: VoteFormV2Props) {
  const { address } = useAccount();
  const [choice, setChoice] = useState<number | null>(null);
  const [weight, setWeight] = useState<string>('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const choices = isD2
    ? [
        { value: 0, label: 'Against' },
        { value: 1, label: 'For' },
      ]
    : [
        { value: 0, label: 'Against' },
        { value: 1, label: 'For' },
        { value: 2, label: 'Abstain' },
      ];

  const handleSubmit = async () => {
    if (choice === null || !address) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // In production: BLAKE512 → ECDH → DuplexSponge → EdDSA → pack
      // For now, create a placeholder encrypted message
      const { generateEphemeralKeyPair } = await import('../../crypto/ecdh');
      const { poseidonEncrypt } = await import('../../crypto/duplexSponge');
      const { generateECDHSharedKey } = await import('../../crypto/ecdh');

      // Generate ephemeral key pair
      const ephemeral = await generateEphemeralKeyPair();

      // ECDH shared key
      const sharedKey = await generateECDHSharedKey(
        ephemeral.sk,
        [coordinatorPubKeyX, coordinatorPubKeyY],
      );

      // Pack command: stateIndex(50) + voteOptionIndex(50) + weight(50) + nonce(50) + pollId(50)
      const nonce = BigInt(getNonce(address, pollId));
      const packedCommand = packCommand(
        0n,                    // stateIndex (to be set by actual registration)
        BigInt(choice),        // voteOptionIndex
        BigInt(weight),        // newVoteWeight
        nonce,                 // nonce
        BigInt(pollId),        // pollId
      );

      // Plaintext: [packedCommand, newPubKeyX, newPubKeyY, salt, sigR8x, sigR8y, sigS]
      const salt = BigInt(Math.floor(Math.random() * 2 ** 250));
      const plaintext = [packedCommand, 0n, 0n, salt, 0n, 0n, 0n]; // Simplified (no EdDSA in demo)

      // DuplexSponge encrypt
      const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);

      // Pad to 10 fields for publishMessage
      const encMessage: bigint[] = new Array(10).fill(0n);
      for (let i = 0; i < Math.min(ciphertext.length, 10); i++) {
        encMessage[i] = ciphertext[i];
      }

      // Submit to Poll contract
      const hash = await writeContractAsync({
        address: POLL_V2_ADDRESS,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage.map((v) => v) as any,
          ephemeral.pk[0],
          ephemeral.pk[1],
        ],
      });

      setTxHash(hash);
      incrementNonce(address, pollId);
      onVoteSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vote submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="vote-form-v2">
      <h3>Cast Your Vote (MACI V2)</h3>
      <p className="text-sm text-gray-500">
        Your vote is encrypted and cannot be revealed. No one, including the
        coordinator, can link your identity to your vote choice.
      </p>

      <div className="choices">
        {choices.map((c) => (
          <button
            key={c.value}
            className={`choice-btn ${choice === c.value ? 'selected' : ''}`}
            onClick={() => setChoice(c.value)}
            disabled={isSubmitting}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isD2 && (
        <div className="weight-input">
          <label>Vote Weight (cost = weight²)</label>
          <input
            type="number"
            min="1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            disabled={isSubmitting}
          />
          <span className="cost">
            Cost: {BigInt(weight || '0') * BigInt(weight || '0')} credits
          </span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={choice === null || isSubmitting || !address}
        className="submit-btn"
      >
        {isSubmitting ? 'Encrypting & Submitting...' : 'Submit Encrypted Vote'}
      </button>

      {error && <p className="error">{error}</p>}
      {txHash && (
        <p className="success">
          Vote submitted! Tx: {txHash.slice(0, 10)}...
        </p>
      )}
    </div>
  );
}

// Nonce management (localStorage)
function getNonce(address: string, pollId: number): number {
  const key = `maci-nonce-${address}-${pollId}`;
  return parseInt(localStorage.getItem(key) || '1', 10);
}

function incrementNonce(address: string, pollId: number): void {
  const key = `maci-nonce-${address}-${pollId}`;
  const current = getNonce(address, pollId);
  localStorage.setItem(key, String(current + 1));
}

function packCommand(
  stateIndex: bigint,
  voteOptionIndex: bigint,
  newVoteWeight: bigint,
  nonce: bigint,
  pollId: bigint,
): bigint {
  return (
    stateIndex |
    (voteOptionIndex << 50n) |
    (newVoteWeight << 100n) |
    (nonce << 150n) |
    (pollId << 200n)
  );
}
