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
      try {
        const parsed = JSON.parse(stored);
        setCurrentPubKey([BigInt(parsed[0]), BigInt(parsed[1])]);
      } catch {
        // Corrupted key data, remove it
        localStorage.removeItem(`maci-pubkey-${address}-${pollId}`);
        localStorage.removeItem(`maci-pk-${address}`);
      }
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
      // Pack command with full bit-packing: stateIndex | (voteOption << 50) | (weight << 100) | (nonce << 150) | (pollId << 200)
      // Key change: voteOption=0, weight=0, but nonce and pollId must be included
      const packedCommand = stateIndex | (0n << 50n) | (0n << 100n) | (nonce << 150n) | (BigInt(pollId) << 200n);

      // Compute command hash for EdDSA signature
      const saltBytes = crypto.getRandomValues(new Uint8Array(31));
      const salt = BigInt('0x' + Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
      const poseidon = await cm.buildPoseidon();
      const F = poseidon.F;
      // cmdHash must match circuit: Poseidon(stateIndex, newPubKeyX, newPubKeyY, newVoteWeight, salt)
      // See MessageProcessor.circom line 204-209 (5 unpacked inputs, NOT packed command)
      // Key change: weight=0
      const cmdHashF = poseidon([
        F.e(stateIndex),
        F.e(newPubKey[0]),
        F.e(newPubKey[1]),
        F.e(0n),
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

      const ciphertext = await cm.poseidonEncrypt(plaintext, sharedKey, 0n);

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
    <div className="border-t-2 border-slate-200 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <span className="material-symbols-outlined text-lg" aria-hidden="true">shield</span>
          {t.keyManager.title}
        </h4>
        <button
          onClick={() => setShowTooltip(!showTooltip)}
          className="text-slate-400 hover:text-black transition-colors"
          type="button"
          aria-label="Info"
          aria-expanded={showTooltip}
        >
          <span className="material-symbols-outlined text-lg">help</span>
        </button>
      </div>

      {showTooltip && (
        <p className="text-xs text-slate-500 mb-4 p-3 bg-slate-50 border border-slate-200" role="tooltip">
          {t.keyManager.tooltip}
        </p>
      )}

      {currentPubKey ? (
        <div className="flex items-center gap-2 text-sm text-green-600 mb-3">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">verified_user</span>
          <span className="font-bold">{t.keyManager.keyActive}</span>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-xs text-slate-500">{t.keyManager.noKey}</p>
          {!isRegistered && <p className="text-xs text-slate-400">{t.keyManager.noKeyReason}</p>}
        </div>
      )}

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isChanging}
          className="text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-black transition-colors underline underline-offset-4"
        >
          {t.keyManager.changeKey}
        </button>
      ) : (
        <div className="border-2 border-amber-400 bg-amber-50 p-4 space-y-3">
          <p className="text-xs text-amber-700">{t.keyManager.warning}</p>
          <div className="flex gap-2">
            <button
              onClick={handleKeyChange}
              disabled={isChanging}
              className="bg-black text-white px-4 py-2 text-xs font-bold uppercase hover:bg-slate-800 transition-colors"
            >
              {isChanging ? t.keyManager.changing : t.keyManager.confirm}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isChanging}
              className="border-2 border-black px-4 py-2 text-xs font-bold uppercase hover:bg-slate-50 transition-colors"
            >
              {t.keyManager.cancel}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {success && <p className="mt-2 text-xs text-green-600 font-bold">{t.keyManager.success}</p>}
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
