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
import { useAccount, usePublicClient } from 'wagmi';
import { writeContract } from '../../writeHelper';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';
import { useTranslation } from '../../i18n';
import { preloadCrypto } from '../../crypto/preload';
import { getMaciNonce, incrementMaciNonce } from './voteUtils';
import { storageKey } from '../../storageKeys';

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
  const publicClient = usePublicClient();
  const [currentPubKey, setCurrentPubKey] = useState<[bigint, bigint] | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const { t } = useTranslation();

  // writeContract from writeHelper.ts

  // Load current key from localStorage (poll-specific > global)
  useEffect(() => {
    if (!address) return;
    const pollPk = localStorage.getItem(storageKey.pubkey(address, pollId));
    const globalPk = localStorage.getItem(storageKey.pk(address));
    const stored = pollPk || globalPk;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCurrentPubKey([BigInt(parsed[0]), BigInt(parsed[1])]);
      } catch {
        localStorage.removeItem(storageKey.pubkey(address, pollId));
        localStorage.removeItem(storageKey.pk(address));
      }
    }
  }, [address, pollId, isRegistered]);

  const handleKeyChange = useCallback(async () => {
    if (!address || !pollAddress) return;
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
      // Priority: poll-specific (after previous key change) > global (from signUp) > wallet-derived
      const pollSk = await cm.loadEncrypted(storageKey.skPoll(address, pollId), address);
      const globalSk = await cm.loadEncrypted(storageKey.sk(address), address);
      let currentSk: bigint;
      if (pollSk) {
        currentSk = BigInt(pollSk);
      } else if (globalSk) {
        currentSk = BigInt(globalSk);
      } else {
        // Derive from wallet signature (same as signUp flow)
        const MACI_KEY_MESSAGE = 'SIGIL Voting Key v1';
        const provider = (window as any).ethereum;
        if (!provider) throw new Error('No wallet provider');
        const sig: string = await provider.request({
          method: 'personal_sign',
          params: [
            `0x${Array.from(new TextEncoder().encode(MACI_KEY_MESSAGE)).map(b => b.toString(16).padStart(2, '0')).join('')}`,
            address,
          ],
        });
        const sigBytes = new Uint8Array(sig.slice(2).match(/.{2}/g)!.map(h => parseInt(h, 16)));
        currentSk = cm.derivePrivateKey(sigBytes);
        // Cache for future use
        await cm.storeEncrypted(storageKey.sk(address), currentSk.toString(), address);
      }

      // ECDH shared key with coordinator
      const ephemeral = await cm.generateEphemeralKeyPair();
      const sharedKey = await cm.generateECDHSharedKey(
        ephemeral.sk,
        [coordinatorPubKeyX, coordinatorPubKeyY],
      );

      // Pack key change command
      const nonce = BigInt(getMaciNonce(address, pollId));
      // Priority: global key (from signUp) > poll-specific > default 1
      const globalIdx = localStorage.getItem(storageKey.stateIndex(address));
      const pollIdx = localStorage.getItem(storageKey.stateIndexPoll(address, pollId));
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
      if (!address) throw new Error('Wallet not connected');
      const txHash = await writeContract({
        address: pollAddress!,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          ephemeral.pubKey[0],
          ephemeral.pubKey[1],
        ],
        gas: 500_000n,
        account: address,
      });

      // Wait for on-chain confirmation before saving state
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status === 'reverted') {
          throw new Error('Key change transaction reverted on-chain');
        }
      }

      // Save new keypair only after confirmed (private key encrypted)
      localStorage.setItem(
        storageKey.pubkey(address, pollId),
        JSON.stringify([newPubKey[0].toString(), newPubKey[1].toString()]),
      );
      await cm.storeEncrypted(
        storageKey.skPoll(address, pollId),
        newSk.toString(),
        address,
      );

      setCurrentPubKey(newPubKey);
      incrementMaciNonce(address, pollId);
      setSuccess(true);
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.keyManager.error);
    } finally {
      setIsChanging(false);
    }
  }, [address, pollId, coordinatorPubKeyX, coordinatorPubKeyY, pollAddress]);

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
          disabled={isChanging || !address}
          className="text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-black transition-colors underline underline-offset-4 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t.keyManager.changeKey}
        </button>
      ) : (
        <div className="border-2 border-amber-400 bg-amber-50 p-4 space-y-3">
          <p className="text-xs text-amber-700">{t.keyManager.warning}</p>
          <div className="flex gap-2">
            <button
              onClick={handleKeyChange}
              disabled={isChanging || !address}
              className="bg-black text-white px-4 py-2 text-xs font-bold uppercase hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

// Nonce management moved to voteUtils.ts (shared counter with VoteFormV2)
