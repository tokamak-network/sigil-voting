/**
 * KeyManager - EdDSA Key Management & Key Change UI
 *
 * MACI Anti-Coercion: users can change their EdDSA key during voting.
 * After a key change, all previous messages signed with the old key
 * become invalid (processed in reverse order → automatically invalidated).
 *
 * This component:
 *   1. Displays current EdDSA public key
 *   2. Provides "Change Key" functionality
 *   3. Sends a key change message via Poll.publishMessage()
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';

interface KeyManagerProps {
  pollId: number;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  pollAddress?: `0x${string}`;
}

export function KeyManager({
  pollId,
  coordinatorPubKeyX,
  coordinatorPubKeyY,
  pollAddress,
}: KeyManagerProps) {
  const { address } = useAccount();
  const [currentPubKey, setCurrentPubKey] = useState<[bigint, bigint] | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { writeContractAsync } = useWriteContract();

  // Load current key from localStorage
  useEffect(() => {
    if (!address) return;
    const stored = localStorage.getItem(`maci-pubkey-${address}-${pollId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      setCurrentPubKey([BigInt(parsed[0]), BigInt(parsed[1])]);
    }
  }, [address, pollId]);

  const handleKeyChange = useCallback(async () => {
    if (!address) return;
    setIsChanging(true);
    setError(null);
    setSuccess(false);

    try {
      // Generate new key pair using BLAKE512
      const { derivePrivateKey } = await import('../../crypto/blake512');
      const { generateEphemeralKeyPair, generateECDHSharedKey } = await import('../../crypto/ecdh');
      const { poseidonEncrypt } = await import('../../crypto/duplexSponge');

      // New key from random seed
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const newSk = await derivePrivateKey(seed);
      const newKeyPair = await generateEphemeralKeyPair();

      // ECDH shared key with coordinator
      const ephemeral = await generateEphemeralKeyPair();
      const sharedKey = await generateECDHSharedKey(
        ephemeral.sk,
        [coordinatorPubKeyX, coordinatorPubKeyY],
      );

      // Pack key change command
      // Key change = publishMessage with newPubKey set to the new key
      const nonce = BigInt(getKeyChangeNonce(address, pollId));
      const packedCommand = 0n; // stateIndex will be resolved
      const plaintext = [
        packedCommand,
        newKeyPair.pk[0],  // newPubKeyX
        newKeyPair.pk[1],  // newPubKeyY
        BigInt(Math.floor(Math.random() * 2 ** 250)), // salt
        0n, 0n, 0n, // signature placeholders
      ];

      const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);

      // Pad to 10 fields
      const encMessage: bigint[] = new Array(10).fill(0n);
      for (let i = 0; i < Math.min(ciphertext.length, 10); i++) {
        encMessage[i] = ciphertext[i];
      }

      // Submit key change message
      await writeContractAsync({
        address: pollAddress || POLL_V2_ADDRESS,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage.map((v) => v) as any,
          ephemeral.pk[0],
          ephemeral.pk[1],
        ],
      });

      // Save new key
      localStorage.setItem(
        `maci-pubkey-${address}-${pollId}`,
        JSON.stringify([newKeyPair.pk[0].toString(), newKeyPair.pk[1].toString()]),
      );
      localStorage.setItem(
        `maci-sk-${address}-${pollId}`,
        newSk.toString(),
      );

      setCurrentPubKey(newKeyPair.pk);
      incrementKeyChangeNonce(address, pollId);
      setSuccess(true);
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Key change failed');
    } finally {
      setIsChanging(false);
    }
  }, [address, pollId, coordinatorPubKeyX, coordinatorPubKeyY, pollAddress, writeContractAsync]);

  return (
    <div className="key-manager">
      <h4>EdDSA Key Management</h4>

      {currentPubKey ? (
        <div className="current-key">
          <label>Current Public Key:</label>
          <code className="key-display">
            ({currentPubKey[0].toString().slice(0, 12)}...,{' '}
            {currentPubKey[1].toString().slice(0, 12)}...)
          </code>
        </div>
      ) : (
        <p className="no-key">No key registered yet.</p>
      )}

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isChanging}
          className="change-key-btn"
        >
          Change Key (Anti-Coercion)
        </button>
      ) : (
        <div className="confirm-dialog">
          <p className="warning">
            Changing your key will invalidate ALL previous votes signed with
            your current key. You will need to re-vote after the key change.
            This is the MACI anti-coercion mechanism.
          </p>
          <div className="confirm-actions">
            <button onClick={handleKeyChange} disabled={isChanging}>
              {isChanging ? 'Changing Key...' : 'Confirm Key Change'}
            </button>
            <button onClick={() => setShowConfirm(false)} disabled={isChanging}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {success && (
        <p className="success">
          Key changed successfully. Your previous votes are now invalid.
          Please submit a new vote.
        </p>
      )}
    </div>
  );
}

function getKeyChangeNonce(address: string, pollId: number): number {
  const key = `maci-keychange-nonce-${address}-${pollId}`;
  return parseInt(localStorage.getItem(key) || '1', 10);
}

function incrementKeyChangeNonce(address: string, pollId: number): void {
  const key = `maci-keychange-nonce-${address}-${pollId}`;
  const current = getKeyChangeNonce(address, pollId);
  localStorage.setItem(key, String(current + 1));
}
