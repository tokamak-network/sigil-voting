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
import { preloadCrypto } from '../../crypto/preload';

interface KeyManagerProps {
  pollId: number;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  pollAddress?: `0x${string}`;
  isRegistered?: boolean;
}

export function KeyManager({
  pollId,
  coordinatorPubKeyX,
  coordinatorPubKeyY,
  pollAddress,
  isRegistered,
}: KeyManagerProps) {
  const { address } = useAccount();
  const [currentPubKey, setCurrentPubKey] = useState<[bigint, bigint] | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const { t } = useTranslation();

  const { writeContractAsync } = useWriteContract();

  // Load current key from localStorage (poll-specific > global)
  useEffect(() => {
    if (!address) return;
    const pollPk = localStorage.getItem(`maci-pubkey-${address}-${pollId}`);
    const globalPk = localStorage.getItem(`maci-pk-${address}`);
    const stored = pollPk || globalPk;
    if (stored) {
      const parsed = JSON.parse(stored);
      setCurrentPubKey([BigInt(parsed[0]), BigInt(parsed[1])]);
    }
  }, [address, pollId, isRegistered]);

  const handleKeyChange = useCallback(async () => {
    if (!address) return;
    setIsChanging(true);
    setError(null);
    setSuccess(false);

    try {
      const cm = await preloadCrypto();

      // Generate new MACI keypair from random seed
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const newSk = cm.derivePrivateKey(seed);
      const newPubKey = await cm.eddsaDerivePublicKey(newSk);

      // Get current sk for signing the key change command
      // Priority: poll-specific (after previous key change) > global (from signUp)
      const pollSk = await cm.loadEncrypted(`maci-sk-${address}-${pollId}`, address);
      const globalSk = await cm.loadEncrypted(`maci-sk-${address}`, address);
      const currentSk = pollSk ? BigInt(pollSk) : globalSk ? BigInt(globalSk) : newSk;

      // ECDH shared key with coordinator
      const ephemeral = await cm.generateEphemeralKeyPair();
      const sharedKey = await cm.generateECDHSharedKey(
        ephemeral.sk,
        [coordinatorPubKeyX, coordinatorPubKeyY],
      );

      // Pack key change command
      const nonce = BigInt(getKeyChangeNonce(address, pollId));
      // Priority: global key (from signUp) > poll-specific > default 1
      const globalIdx = localStorage.getItem(`maci-stateIndex-${address}`);
      const pollIdx = localStorage.getItem(`maci-stateIndex-${address}-${pollId}`);
      const stateIndex = globalIdx ? BigInt(globalIdx) : pollIdx ? BigInt(pollIdx) : 1n;
      const packedCommand = stateIndex; // Key change: only stateIndex matters, weight=0

      // Compute command hash for EdDSA signature
      const salt = BigInt(Math.floor(Math.random() * 2 ** 250));
      const poseidon = await cm.buildPoseidon();
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
      const signature = await cm.eddsaSign(cmdHash, currentSk);

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

      const ciphertext = await cm.poseidonEncrypt(plaintext, sharedKey, nonce);

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

      // Save new keypair (private key encrypted)
      localStorage.setItem(
        `maci-pubkey-${address}-${pollId}`,
        JSON.stringify([newPubKey[0].toString(), newPubKey[1].toString()]),
      );
      await cm.storeEncrypted(
        `maci-sk-${address}-${pollId}`,
        newSk.toString(),
        address,
      );

      setCurrentPubKey(newPubKey);
      incrementKeyChangeNonce(address, pollId);
      setSuccess(true);
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.keyManager.error);
    } finally {
      setIsChanging(false);
    }
  }, [address, pollId, coordinatorPubKeyX, coordinatorPubKeyY, pollAddress, writeContractAsync]);

  return (
    <div className="key-manager key-manager-visible">
      <div className="key-manager-header">
        <h4>
          <span className="material-symbols-outlined key-manager-icon" aria-hidden="true">shield</span>
          {t.keyManager.title}
        </h4>
        <button
          className="key-manager-info-btn"
          onClick={() => setShowTooltip(!showTooltip)}
          type="button"
          aria-label="Info"
          aria-expanded={showTooltip}
        >
          <span className="material-symbols-outlined">help</span>
        </button>
      </div>

      {showTooltip && (
        <div className="key-manager-tooltip" role="tooltip">
          {t.keyManager.tooltip}
        </div>
      )}

      {currentPubKey ? (
        <div className="current-key">
          <span className="key-active-badge">
            <span className="material-symbols-outlined" aria-hidden="true">verified_user</span>
            {t.keyManager.keyActive}
          </span>
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
