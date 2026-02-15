/**
 * KeyManager - EdDSA Key Management & Key Change UI
 *
 * MACI Anti-Coercion: users can change their EdDSA key during voting.
 * After a key change, all previous messages signed with the old key
 * become invalid (processed in reverse order -> automatically invalidated).
 *
 * Displayed as a collapsible "Advanced Options" section to reduce
 * cognitive load for regular users.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';
import { useTranslation } from '../../i18n';

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
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

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
      const { derivePrivateKey } = await import('../../crypto/blake512');
      const { generateEphemeralKeyPair, generateECDHSharedKey } = await import('../../crypto/ecdh');
      const { poseidonEncrypt } = await import('../../crypto/duplexSponge');
      const { eddsaSign, eddsaDerivePublicKey } = await import('../../crypto/eddsa');

      // Generate new MACI keypair from random seed
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const newSk = derivePrivateKey(seed);
      const newPubKey = await eddsaDerivePublicKey(newSk);

      // Get current sk for signing the key change command
      const storedSk = localStorage.getItem(`maci-sk-${address}-${pollId}`);
      const currentSk = storedSk ? BigInt(storedSk) : newSk;

      // ECDH shared key with coordinator
      const ephemeral = await generateEphemeralKeyPair();
      const sharedKey = await generateECDHSharedKey(
        ephemeral.sk,
        [coordinatorPubKeyX, coordinatorPubKeyY],
      );

      // Pack key change command
      const nonce = BigInt(getKeyChangeNonce(address, pollId));
      const stateIndexStr = localStorage.getItem(`maci-stateIndex-${address}-${pollId}`);
      const stateIndex = stateIndexStr ? BigInt(stateIndexStr) : 0n;
      const packedCommand = stateIndex; // Key change: only stateIndex matters, weight=0

      // Compute command hash for EdDSA signature
      const salt = BigInt(Math.floor(Math.random() * 2 ** 250));
      // @ts-expect-error - circomlibjs doesn't have types
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();
      const F = poseidon.F;
      const cmdHashF = poseidon([
        F.e(stateIndex),
        F.e(newPubKey[0]),
        F.e(newPubKey[1]),
        F.e(0n), // newVoteWeight = 0 for key change
        F.e(salt),
      ]);
      const cmdHash = F.toObject(cmdHashF);

      // Sign with current key
      const signature = await eddsaSign(cmdHash, currentSk);

      // Compose plaintext with real signature
      const plaintext = [
        packedCommand,
        newPubKey[0],
        newPubKey[1],
        salt,
        signature.R8[0],
        signature.R8[1],
        signature.S,
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
          ephemeral.pubKey[0],
          ephemeral.pubKey[1],
        ],
      });

      // Save new keypair
      localStorage.setItem(
        `maci-pubkey-${address}-${pollId}`,
        JSON.stringify([newPubKey[0].toString(), newPubKey[1].toString()]),
      );
      localStorage.setItem(
        `maci-sk-${address}-${pollId}`,
        newSk.toString(),
      );

      setCurrentPubKey(newPubKey);
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
      <button
        className="key-manager-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span>{t.keyManager.expandLabel}</span>
        <span className="material-symbols-outlined">
          {isExpanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isExpanded && (
        <div className="key-manager-content">
          <h4>{t.keyManager.title}</h4>

          {currentPubKey ? (
            <div className="current-key">
              <label>{t.keyManager.currentKey}</label>
              <code className="key-display">
                ({currentPubKey[0].toString().slice(0, 12)}...,{' '}
                {currentPubKey[1].toString().slice(0, 12)}...)
              </code>
            </div>
          ) : (
            <p className="no-key">{t.keyManager.noKey}</p>
          )}

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isChanging}
              className="change-key-btn"
            >
              {t.keyManager.changeKey}
            </button>
          ) : (
            <div className="confirm-dialog">
              <p className="warning">{t.keyManager.warning}</p>
              <div className="confirm-actions">
                <button onClick={handleKeyChange} disabled={isChanging}>
                  {isChanging ? t.keyManager.changing : t.keyManager.confirm}
                </button>
                <button onClick={() => setShowConfirm(false)} disabled={isChanging}>
                  {t.keyManager.cancel}
                </button>
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{t.keyManager.success}</p>}
        </div>
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
