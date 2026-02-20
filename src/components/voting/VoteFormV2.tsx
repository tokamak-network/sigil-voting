/**
 * VoteFormV2 - MACI Encrypted Voting Form
 *
 * Quadratic voting: voters choose For/Against and pick their vote weight.
 * Cost = weight² credits. Weight 1 = simple vote. Weight 3 = 9 credits.
 *
 * Flow:
 *   1. User selects vote choice (For / Against)
 *   2. User picks vote weight via slider (default 1)
 *   3. BLAKE512 key derivation -> ECDH -> DuplexSponge encryption
 *   4. EdDSA-Poseidon signature
 *   5. Binary command packing
 *   6. Poll.publishMessage(encMessage, encPubKey)
 */

import { useState, useRef, useEffect } from 'react';
import { useAccount, usePublicClient, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { writeContract } from '../../writeHelper';
import { POLL_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';
import { VoteConfirmModal } from './VoteConfirmModal';
import { TransactionModal } from './TransactionModal';
import { preloadCrypto } from '../../crypto/preload';
import { getLastVote, getMaciNonce, incrementMaciNonce } from './voteUtils';
import { storageKey } from '../../storageKeys';

interface VoteFormV2Props {
  pollId: number;
  pollAddress: `0x${string}`;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  voiceCredits?: number;
  isExpired?: boolean;
  isRegistered?: boolean;
  onSignUp?: () => Promise<void>;
  onVoteSubmitted?: (txHash: string) => void;
}

type TxStage = 'idle' | 'registering' | 'keyChanging' | 'encrypting' | 'signing' | 'confirming' | 'waiting' | 'done' | 'error';

export function VoteFormV2({
  pollId,
  pollAddress,
  coordinatorPubKeyX,
  coordinatorPubKeyY,
  voiceCredits = 100,
  isExpired = false,
  isRegistered = true,
  onSignUp,
  onVoteSubmitted,
}: VoteFormV2Props) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [choice, setChoice] = useState<number | null>(null);
  const [weight, setWeight] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [txStage, setTxStage] = useState<TxStage>('idle');
  const [estimatedGasEth, setEstimatedGasEth] = useState<string | null>(null);
  const { t } = useTranslation();

  // writeContract from writeHelper.ts — bypasses wagmi connector

  // ETH balance for gas fee display
  const { data: ethBalance } = useBalance({ address });
  const ethBalanceStr = ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(4) : '—';
  const ethBalanceNum = ethBalance ? parseFloat(formatEther(ethBalance.value)) : 0;

  // Estimate gas cost on mount
  useEffect(() => {
    if (!publicClient || !pollAddress || !address) return;
    const estimateGas = async () => {
      try {
        // Use a dummy publishMessage call to estimate gas
        const dummyMsg = new Array(10).fill(0n) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
        const gasLimit = await publicClient.estimateContractGas({
          address: pollAddress,
          abi: POLL_ABI,
          functionName: 'publishMessage',
          args: [dummyMsg, 1n, 1n],
          account: address,
        });
        const gasPrice = await publicClient.getGasPrice();
        const gasCostWei = gasLimit * gasPrice;
        // Add 20% buffer for safety
        const totalCost = isRegistered
          ? gasCostWei * 120n / 100n
          : gasCostWei * 280n / 100n; // signUp + publishMessage ≈ 2.8x
        setEstimatedGasEth(parseFloat(formatEther(totalCost)).toFixed(4));
      } catch (err) {
        console.warn('Gas estimation failed:', err);
        // Show null so UI displays "..." instead of misleading value
        setEstimatedGasEth(null);
      }
    };
    estimateGas();
  }, [publicClient, pollAddress, address, isRegistered]);

  // Vote history detection (shared MACI nonce: votes + key changes)
  const hasVoted = address ? getMaciNonce(address, pollId) > 1 : false;
  const lastVote = address ? getLastVote(address, pollId) : null;
  const creditsSpent = address ? getCreditsSpent(address, pollId) : 0;
  const creditsRemaining = voiceCredits - creditsSpent;

  const MAX_WEIGHT = Math.floor(Math.sqrt(Math.max(creditsRemaining, 0)));
  const cost = weight * weight;
  const creditExceeded = cost > creditsRemaining;

  // Preload crypto modules in background on mount
  useEffect(() => { preloadCrypto(); }, []);

  // Capture registration state at submit time (so it doesn't change mid-flow)
  const wasRegisteredRef = useRef(true);

  const handleSubmit = async () => {
    if (choice === null || !address) return;
    wasRegisteredRef.current = isRegistered;
    const isReVote = getMaciNonce(address, pollId) > 1;
    setIsSubmitting(true);
    setError(null);

    try {
      // Auto-register if not yet registered
      if (!isRegistered && onSignUp) {
        setTxStage('registering');
        await onSignUp();
      }

      setTxStage('encrypting');
      const crypto = await preloadCrypto();
      const poseidon = await crypto.buildPoseidon();
      const F = poseidon.F;

      // Get current keypair
      let currentSk: bigint;
      let currentPubKey: [bigint, bigint];
      {
        const kp = await getOrCreateMaciKeypair(
          address, pollId, crypto.derivePrivateKey, crypto.eddsaDerivePublicKey, crypto.loadEncrypted, crypto.storeEncrypted,
        );
        currentSk = kp.sk;
        currentPubKey = kp.pubKey;
      }

      // Determine the keypair that will sign the vote message
      let voteSk = currentSk;
      let votePubKey = currentPubKey;

      // --- Step A: Auto key change on re-vote ---
      if (isReVote) {
        setTxStage('keyChanging');

        // Generate new random keypair
        const seed = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const newSk = crypto.derivePrivateKey(seed);
        const newPubKey = await crypto.eddsaDerivePublicKey(newSk);

        // ECDH for key change message
        let kcEphemeral: Awaited<ReturnType<typeof crypto.generateEphemeralKeyPair>>;
        let kcSharedKey: Awaited<ReturnType<typeof crypto.generateECDHSharedKey>>;
        try {
          kcEphemeral = await crypto.generateEphemeralKeyPair();
          kcSharedKey = await crypto.generateECDHSharedKey(
            kcEphemeral.sk,
            [coordinatorPubKeyX, coordinatorPubKeyY],
          );
        } catch (ecdhErr) {
          throw new Error('ECDH key exchange failed: ' + (ecdhErr instanceof Error ? ecdhErr.message : String(ecdhErr)));
        }

        const kcNonce = BigInt(getMaciNonce(address, pollId));
        const stateIndex = BigInt(getStateIndex(address, pollId));
        // Key change command: voteOption=0, weight=0
        const kcPackedCommand = stateIndex | (0n << 50n) | (0n << 100n) | (kcNonce << 150n) | (BigInt(pollId) << 200n);

        const kcSaltBytes = globalThis.crypto.getRandomValues(new Uint8Array(31));
        const kcSalt = BigInt('0x' + Array.from(kcSaltBytes).map(b => b.toString(16).padStart(2, '0')).join(''));

        // cmdHash: Poseidon(stateIndex, newPubKeyX, newPubKeyY, weight=0, salt)
        const kcCmdHashF = poseidon([
          F.e(stateIndex),
          F.e(newPubKey[0]),
          F.e(newPubKey[1]),
          F.e(0n),
          F.e(kcSalt),
        ]);
        const kcCmdHash = F.toObject(kcCmdHashF);

        // Sign with current key
        const kcSignature = await crypto.eddsaSign(kcCmdHash, currentSk);

        const kcPlaintext = [
          kcPackedCommand,
          newPubKey[0],
          newPubKey[1],
          kcSalt,
          kcSignature.R8[0],
          kcSignature.R8[1],
          kcSignature.S,
        ];

        const kcCiphertext = await crypto.poseidonEncrypt(kcPlaintext, kcSharedKey, 0n);
        const kcEncMessage: bigint[] = new Array(10).fill(0n);
        for (let i = 0; i < Math.min(kcCiphertext.length, 10); i++) {
          kcEncMessage[i] = kcCiphertext[i];
        }

        setTxStage('confirming');

        // Submit key change message
        const kcHash = await publishWithRetry(pollAddress, kcEncMessage, kcEphemeral.pubKey, address, setTxStage);

        setTxStage('waiting');

        // Wait for on-chain confirmation (2 min timeout)
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: kcHash, timeout: 120_000 });
          if (receipt.status === 'reverted') {
            throw new Error('Key change transaction reverted on-chain');
          }
        }

        // Save new keypair and increment nonce
        localStorage.setItem(
          storageKey.pubkey(address, pollId),
          JSON.stringify([newPubKey[0].toString(), newPubKey[1].toString()]),
        );
        await crypto.storeEncrypted(
          storageKey.skPoll(address, pollId),
          newSk.toString(),
          address,
        );
        incrementMaciNonce(address, pollId);

        // Use the new key for the vote
        voteSk = newSk;
        votePubKey = newPubKey;
      }

      // --- Step B: Send vote message ---
      setTxStage('encrypting');

      let ephemeral: Awaited<ReturnType<typeof crypto.generateEphemeralKeyPair>>;
      let sharedKey: Awaited<ReturnType<typeof crypto.generateECDHSharedKey>>;
      try {
        ephemeral = await crypto.generateEphemeralKeyPair();
        sharedKey = await crypto.generateECDHSharedKey(
          ephemeral.sk,
          [coordinatorPubKeyX, coordinatorPubKeyY],
        );
      } catch (ecdhErr) {
        throw new Error('ECDH key exchange failed: ' + (ecdhErr instanceof Error ? ecdhErr.message : String(ecdhErr)));
      }

      const nonce = BigInt(getMaciNonce(address, pollId));
      const stateIndex = BigInt(getStateIndex(address, pollId));
      const packedCommand = packCommand(
        stateIndex,
        BigInt(choice),
        BigInt(weight),
        nonce,
        BigInt(pollId),
      );

      setTxStage('signing');

      const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(31));
      const salt = BigInt('0x' + Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join(''));

      // cmdHash must match circuit: Poseidon(stateIndex, newPubKeyX, newPubKeyY, newVoteWeight, salt)
      const cmdHashF = poseidon([
        F.e(stateIndex),
        F.e(votePubKey[0]),
        F.e(votePubKey[1]),
        F.e(BigInt(weight)),
        F.e(salt),
      ]);
      const cmdHash = F.toObject(cmdHashF);

      const signature = await crypto.eddsaSign(cmdHash, voteSk);

      const plaintext = [
        packedCommand,
        votePubKey[0],
        votePubKey[1],
        salt,
        signature.R8[0],
        signature.R8[1],
        signature.S,
      ];

      const ciphertext = await crypto.poseidonEncrypt(plaintext, sharedKey, 0n);

      const encMessage: bigint[] = new Array(10).fill(0n);
      for (let i = 0; i < Math.min(ciphertext.length, 10); i++) {
        encMessage[i] = ciphertext[i];
      }

      setTxStage('confirming');

      // Re-check wallet connection before submitting transaction
      if (!address) {
        setError(t.maci.connectWallet);
        setTxStage('error');
        setIsSubmitting(false);
        return;
      }

      const hash = await publishWithRetry(pollAddress, encMessage, ephemeral.pubKey, address, setTxStage);

      setTxStage('waiting');
      setTxHash(hash);

      // Wait for on-chain confirmation before saving state (2 min timeout)
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (receipt.status === 'reverted') {
          throw new Error('Transaction reverted on-chain');
        }
      }

      // Only save state after confirmed on-chain
      incrementMaciNonce(address, pollId);
      saveLastVote(address, pollId, choice, weight, cost);
      setCreditsSpent(address, pollId, cost);

      onVoteSubmitted?.(hash);
      setTxStage('done');
    } catch (err) {
      console.error('Vote error:', err);
      setTxStage('error');
      const msg = err instanceof Error ? err.message : String(err);
      // Signup errors come pre-translated with 'signup:' prefix
      if (msg.startsWith('signup:')) {
        setError(msg.slice(7));
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        setError(t.voteForm.errorRejectedFriendly);
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) {
        setError(t.voteForm.errorGasFriendly);
      } else if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('Timed out')) {
        setError(t.voteForm.errorTimeout);
      } else if (msg.includes('ECDH') || msg.includes('shared key') || msg.includes('invalid point')) {
        setError(t.voteForm.errorEncryption);
      } else {
        console.error('Vote error detail:', msg);
        setError(t.voteForm.errorGeneric);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const stageMessages: Record<TxStage, string> = {
    idle: '',
    registering: t.voteForm.stageRegistering,
    keyChanging: t.voteForm.stageKeyChange,
    encrypting: t.voteForm.stageEncrypting,
    signing: t.voteForm.stageSigning,
    confirming: t.voteForm.stageConfirming,
    waiting: t.voteForm.stageWaiting,
    done: t.voteForm.stageDone,
    error: '',
  };

  // Transaction progress modal
  if (txStage !== 'idle' && txStage !== 'done' && txStage !== 'error') {
    const txSteps = [
      ...(!wasRegisteredRef.current ? [{ key: 'registering', label: t.voteForm.stageRegistering }] : []),
      ...(hasVoted ? [{ key: 'keyChanging', label: t.voteForm.stageKeyChange }] : []),
      { key: 'encrypting', label: t.voteForm.stageEncrypting },
      { key: 'signing', label: t.voteForm.stageSigning },
      { key: 'confirming', label: t.voteForm.stageConfirming },
      { key: 'waiting', label: t.voteForm.stageWaiting },
    ];

    return (
      <TransactionModal
        title={t.voteForm.processing}
        steps={txSteps}
        currentStep={txStage}
        subtitle={stageMessages[txStage]}
      />
    );
  }

  // Poll expired
  if (isExpired) {
    return (
      <div className="bg-white p-8 border-4 border-black flex flex-col gap-10" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>
        <div className="p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-slate-300">timer_off</span>
          <p className="font-display font-bold text-xl uppercase mt-4">{t.timer.ended}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 border-4 border-black flex flex-col gap-10 md:sticky md:top-32" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>

      {/* Vote history banner */}
      {hasVoted && lastVote && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-slate-50 border-2 border-black/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-slate-500" aria-hidden="true">info</span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t.voteHistory.alreadyVoted}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-mono text-slate-600">
            <span>{t.voteHistory.lastChoice}: <strong className="text-black">{lastVote.choice === 1 ? t.voteForm.for : t.voteForm.against}</strong></span>
            <span>{t.voteHistory.lastWeight}: <strong className="text-black">{lastVote.weight}</strong></span>
            <span>{t.voteHistory.lastCost}: <strong className="text-black">{lastVote.cost}</strong></span>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase">{t.voteHistory.overrideWarning}</p>
        </div>
      )}

      {/* Auto-register notice for first-time voters */}
      {!isRegistered && !hasVoted && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-2 border-blue-200">
          <span className="material-symbols-outlined text-[16px] text-blue-500" aria-hidden="true">info</span>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">{t.voteForm.autoRegisterNotice}</span>
        </div>
      )}

      {/* Zero credits notice */}
      {voiceCredits === 0 && (
        <div className="flex flex-col gap-2 px-4 py-4 bg-amber-50 border-2 border-amber-300" role="alert">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-amber-600" aria-hidden="true">warning</span>
            <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">{t.voteForm.noCreditsTitle}</span>
          </div>
          <p className="text-xs text-amber-600">{t.voteForm.noCreditsDesc}</p>
          <a
            href="https://sepolia.etherscan.io/address/0xa30fe40285B8f5c0457DbC3B7C8A280373c40044"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-primary underline"
          >
            Get TON Tokens
          </a>
        </div>
      )}

      {/* CHOOSE DIRECTION */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary"></span>
          {t.voteForm.title}
        </h3>
        <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label={t.voteForm.title}>
          <button
            className={`border-2 border-black py-6 font-black text-lg uppercase tracking-widest flex flex-col items-center justify-center gap-1 transition-all ${
              choice === 1
                ? 'bg-emerald-500 text-white'
                : 'bg-white text-black hover:bg-slate-50'
            }`}
            style={{ boxShadow: choice === 1 ? '4px 4px 0px 0px rgba(16, 185, 129, 1)' : '4px 4px 0px 0px rgba(0, 0, 0, 1)' }}
            onClick={() => setChoice(1)}
            disabled={isSubmitting}
            role="radio"
            aria-checked={choice === 1}
          >
            <span className="material-symbols-outlined text-3xl">add_circle</span>
            {t.voteForm.for}
          </button>
          <button
            className={`border-2 border-black py-6 font-black text-lg uppercase tracking-widest flex flex-col items-center justify-center gap-1 transition-all ${
              choice === 0
                ? 'bg-red-500 text-white'
                : 'bg-white text-black hover:bg-slate-50'
            }`}
            style={{ boxShadow: choice === 0 ? '4px 4px 0px 0px rgba(239, 68, 68, 1)' : '4px 4px 0px 0px rgba(0, 0, 0, 1)' }}
            onClick={() => setChoice(0)}
            disabled={isSubmitting}
            role="radio"
            aria-checked={choice === 0}
          >
            <span className="material-symbols-outlined text-3xl">remove_circle</span>
            {t.voteForm.against}
          </button>
        </div>
      </div>

      {/* VOTE INTENSITY */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-2 h-2 bg-primary"></span>
            {t.voteForm.weightLabel}
          </h3>
          <span className="text-xs font-mono font-bold bg-black text-white px-2 py-1 uppercase">{t.voteFormExtra.quadraticScaling}</span>
        </div>
        <div className="flex items-center gap-4 mb-8">
          <button
            className="w-16 h-16 border-2 border-black flex items-center justify-center font-bold text-2xl hover:bg-slate-100 transition-colors"
            onClick={() => setWeight(Math.max(1, weight - 1))}
            disabled={isSubmitting || weight <= 1}
          >
            -
          </button>
          <div className="flex-1 h-16 border-2 border-black flex items-center justify-center font-mono font-bold text-4xl bg-slate-50">
            {weight}
          </div>
          <button
            className="w-16 h-16 border-2 border-black flex items-center justify-center font-bold text-2xl hover:bg-slate-100 transition-colors"
            onClick={() => setWeight(Math.min(MAX_WEIGHT, weight + 1))}
            disabled={isSubmitting || weight >= MAX_WEIGHT}
          >
            +
          </button>
        </div>
        <div className="px-2">
          <input
            id="vote-weight"
            className="w-full h-1 bg-black appearance-none cursor-pointer"
            type="range"
            min="1"
            max={Math.max(1, MAX_WEIGHT * MAX_WEIGHT)}
            step="1"
            value={cost}
            onChange={(e) => {
              const newCost = Number(e.target.value);
              setWeight(Math.max(1, Math.round(Math.sqrt(newCost))));
            }}
            disabled={isSubmitting}
            aria-describedby="vote-cost"
          />
          <div className="flex justify-between mt-4 text-xs font-bold text-slate-400 font-mono">
            <span>{t.voteFormExtra.minCredit}</span>
            <span>{t.voteFormExtra.maxCredits.replace('{n}', String(MAX_WEIGHT * MAX_WEIGHT))}</span>
          </div>
          <p className="mt-3 text-xs text-center text-slate-400 font-mono">{t.voteForm.quadraticGuide}</p>
        </div>
      </div>

      {/* Cost / Remaining grid */}
      <div className="grid grid-cols-2 gap-px bg-black border-2 border-black">
        <div className="bg-slate-50 p-6 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{t.voteForm.cost}</h3>
          <span className="text-xs font-bold text-slate-500 mb-1">{t.voteForm.weightLabel}: {weight}&sup2;</span>
          <span className="text-2xl font-mono font-bold text-emerald-500">{cost}</span>
          <span className="text-xs font-bold text-slate-400 uppercase mt-1">{t.voteForm.credits}</span>
        </div>
        <div className="bg-slate-50 p-6 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{t.voteForm.myCredits}</h3>
          <span className="text-xs font-bold text-slate-500 mb-1">{creditsRemaining} / {voiceCredits}</span>
          <span className={`text-2xl font-mono font-bold ${creditsRemaining - cost < 0 ? 'text-red-500' : 'text-black'}`}>{Math.max(0, creditsRemaining - cost)}</span>
          <span className="text-xs font-bold text-slate-400 uppercase mt-1">{t.voteHistory.creditsRemaining}</span>
        </div>
      </div>

      {/* Credit exceeded warning */}
      {creditExceeded && (
        <p className="text-sm font-bold text-red-600 uppercase tracking-wide text-center" role="alert">
          {t.voteForm.creditExceeded}
        </p>
      )}

      {/* Gas Fee Estimate */}
      <div className="border-2 border-slate-200 p-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.voteForm.estimatedGas}</span>
          <span className="text-xs font-mono font-bold text-slate-600">
            ~{estimatedGasEth || '...'} ETH
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.voteForm.yourEthBalance}</span>
          <span className={`text-xs font-mono font-bold ${
            estimatedGasEth && ethBalanceNum < parseFloat(estimatedGasEth) ? 'text-red-500' : 'text-emerald-600'
          }`}>
            {ethBalanceStr} ETH
          </span>
        </div>
        {!isRegistered && (
          <p className="text-xs font-mono text-amber-600 pt-1">{t.voteForm.firstVoteNote}</p>
        )}
        {estimatedGasEth && ethBalanceNum < parseFloat(estimatedGasEth) && (
          <p className="text-xs font-bold text-red-500 pt-1">{t.voteForm.lowBalance}</p>
        )}
      </div>

      {/* Submit */}
      <div className="pt-4">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={choice === null || isSubmitting || !address || creditExceeded}
          className="w-full bg-primary text-white py-6 font-display font-black uppercase italic text-2xl tracking-widest border-2 border-black hover:translate-y-[-2px] hover:translate-x-[-2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:translate-x-0"
          style={{ boxShadow: '4px 4px 0px 0px rgba(37, 99, 235, 1)' }}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? t.voteForm.submitting : t.voteForm.submit}
        </button>
        <div className="flex items-center justify-center gap-2 mt-6 py-3 bg-slate-50 border border-black/10">
          <span className="material-symbols-outlined text-[16px] text-green-600">lock</span>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            {t.voteForm.desc}
          </p>
        </div>
      </div>

      {showConfirm && choice !== null && (
        <VoteConfirmModal
          choice={choice}
          weight={weight}
          cost={cost}
          onConfirm={() => {
            setShowConfirm(false);
            handleSubmit();
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {error && (
        <div className="flex flex-col items-center gap-3 p-6 bg-red-50 border-2 border-red-300" role="alert">
          <p className="text-sm font-bold text-red-700">{error}</p>
          <button
            className="px-6 py-2 bg-black text-white font-bold uppercase text-xs tracking-widest border-2 border-black hover:bg-slate-800 transition-colors"
            onClick={() => { setError(null); setTxStage('idle'); }}
          >
            {t.voteForm.retry}
          </button>
        </div>
      )}

      {txHash && txStage === 'done' && (
        <div className="flex flex-col items-center gap-3 p-6 bg-green-50 border-2 border-green-300" role="status">
          <span className="material-symbols-outlined text-4xl text-green-600" aria-hidden="true">check_circle</span>
          <span className="font-bold text-green-800 uppercase tracking-wide">{t.voteForm.success}</span>
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-primary underline"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-6)}
          </a>
          <p className="text-xs font-bold text-slate-500 text-center">{t.voteForm.successNext}</p>
        </div>
      )}
    </div>
  );
}

// Vote history read + nonce management is in voteUtils.ts (shared with KeyManager)

function saveLastVote(address: string, pollId: number, choice: number, weight: number, cost: number): void {
  localStorage.setItem(storageKey.lastVote(address, pollId), JSON.stringify({ choice, weight, cost }));
}

// Credit tracking (localStorage)
function getCreditsSpent(address: string, pollId: number): number {
  return parseInt(localStorage.getItem(storageKey.creditsSpent(address, pollId)) || '0', 10);
}

function setCreditsSpent(address: string, pollId: number, cost: number): void {
  const key = storageKey.creditsSpent(address, pollId);
  // Replace (not accumulate): only one vote is valid in MACI (first vote wins).
  // Re-votes are rejected, so creditsSpent should reflect the latest vote cost only.
  localStorage.setItem(key, String(cost));
}

function getStateIndex(address: string, _pollId: number): number {
  const globalVal = localStorage.getItem(storageKey.stateIndex(address));
  if (globalVal) return parseInt(globalVal, 10);
  const pollVal = localStorage.getItem(storageKey.stateIndexPoll(address, _pollId));
  if (pollVal) return parseInt(pollVal, 10);
  return 1;
}

async function getOrCreateMaciKeypair(
  address: string,
  pollId: number,
  derivePrivateKey: (seed: Uint8Array) => bigint,
  eddsaDerivePublicKey: (sk: bigint) => Promise<[bigint, bigint]>,
  loadEncrypted: (storageKey: string, address: string) => Promise<string | null>,
  storeEncrypted: (storageKey: string, value: string, address: string) => Promise<void>,
): Promise<{ sk: bigint; pubKey: [bigint, bigint] }> {
  const pollSkKey = storageKey.skPoll(address, pollId);
  const pollPkKey = storageKey.pubkey(address, pollId);
  const storedPollSk = await loadEncrypted(pollSkKey, address);
  if (storedPollSk) {
    const sk = BigInt(storedPollSk);
    const storedPk = localStorage.getItem(pollPkKey);
    if (storedPk) {
      try {
        const parsed = JSON.parse(storedPk);
        return { sk, pubKey: [BigInt(parsed[0]), BigInt(parsed[1])] };
      } catch {
        localStorage.removeItem(pollPkKey);
      }
    }
    const pubKey = await eddsaDerivePublicKey(sk);
    localStorage.setItem(pollPkKey, JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
    return { sk, pubKey };
  }

  const globalSkKey = storageKey.sk(address);
  const globalPkKey = storageKey.pk(address);
  const storedGlobalSk = await loadEncrypted(globalSkKey, address);
  if (storedGlobalSk) {
    const sk = BigInt(storedGlobalSk);
    const storedPk = localStorage.getItem(globalPkKey);
    if (storedPk) {
      try {
        const parsed = JSON.parse(storedPk);
        return { sk, pubKey: [BigInt(parsed[0]), BigInt(parsed[1])] };
      } catch {
        localStorage.removeItem(globalPkKey);
      }
    }
    const pubKey = await eddsaDerivePublicKey(sk);
    localStorage.setItem(globalPkKey, JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
    return { sk, pubKey };
  }

  // Fallback: derive from wallet signature (deterministic, recoverable)
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
  const sk = derivePrivateKey(sigBytes);
  const pubKey = await eddsaDerivePublicKey(sk);

  // Cache globally (not per-poll, since wallet signature is always the same)
  await storeEncrypted(globalSkKey, sk.toString(), address);
  localStorage.setItem(globalPkKey, JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
  return { sk, pubKey };
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

async function publishWithRetry(
  pollAddress: `0x${string}`,
  encMessage: bigint[],
  ephemeralPubKey: [bigint, bigint],
  account: `0x${string}`,
  setTxStage: (stage: TxStage) => void,
  maxRetries = 5,
): Promise<`0x${string}`> {
  let retries = 0;
  while (true) {
    try {
      const hash = await writeContract({
        address: pollAddress,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          ephemeralPubKey[0],
          ephemeralPubKey[1],
        ],
        gas: 500_000n,
        account,
      });
      return hash;
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : '';
      if ((retryMsg.includes('underpriced') || retryMsg.includes('nonce') || retryMsg.includes('already known')) && retries < maxRetries) {
        retries++;
        setTxStage('confirming');
        await new Promise(r => setTimeout(r, 10_000));
        continue;
      }
      throw retryErr;
    }
  }
}
