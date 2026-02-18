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
import { useWriteContract, useAccount, usePublicClient } from 'wagmi';
import { POLL_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';
import { VoteConfirmModal } from './VoteConfirmModal';
import { TransactionModal } from './TransactionModal';
import { preloadCrypto } from '../../crypto/preload';
import { getLastVote } from './voteUtils';

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

type TxStage = 'idle' | 'registering' | 'encrypting' | 'signing' | 'confirming' | 'waiting' | 'done' | 'error';

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
  const { t } = useTranslation();

  const { writeContractAsync } = useWriteContract();

  // Vote history detection
  const hasVoted = address ? getNonce(address, pollId) > 1 : false;
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

      const { sk: userSk, pubKey: userPubKey } = await getOrCreateMaciKeypair(
        address, pollId, crypto.derivePrivateKey, crypto.eddsaDerivePublicKey, crypto.loadEncrypted, crypto.storeEncrypted,
      );

      const ephemeral = await crypto.generateEphemeralKeyPair();

      const sharedKey = await crypto.generateECDHSharedKey(
        ephemeral.sk,
        [coordinatorPubKeyX, coordinatorPubKeyY],
      );

      const nonce = BigInt(getNonce(address, pollId));
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

      const poseidon = await crypto.buildPoseidon();
      const F = poseidon.F;
      // cmdHash must match circuit: Poseidon(stateIndex, newPubKeyX, newPubKeyY, newVoteWeight, salt)
      // See MessageProcessor.circom line 204-209 (5 unpacked inputs, NOT packed command)
      const cmdHashF = poseidon([
        F.e(stateIndex),
        F.e(userPubKey[0]),
        F.e(userPubKey[1]),
        F.e(BigInt(weight)),
        F.e(salt),
      ]);
      const cmdHash = F.toObject(cmdHashF);

      const signature = await crypto.eddsaSign(cmdHash, userSk);

      const plaintext = [
        packedCommand,
        userPubKey[0],
        userPubKey[1],
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

      const hash = await writeContractAsync({
        address: pollAddress,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage.map((v) => v) as any,
          ephemeral.pubKey[0],
          ephemeral.pubKey[1],
        ],
      });

      setTxStage('waiting');
      setTxHash(hash);

      // Save state IMMEDIATELY after tx sent (before receipt wait).
      // This prevents double-submit issues: if receipt wait fails but tx
      // is already on-chain, nonce is already incremented so retry creates
      // a new (valid) message instead of a duplicate.
      incrementNonce(address, pollId);
      saveLastVote(address, pollId, choice, weight, cost);
      setCreditsSpent(address, pollId, cost);

      // Wait for on-chain confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setTxStage('done');
      onVoteSubmitted?.(hash);
    } catch (err) {
      setTxStage('error');
      const msg = err instanceof Error ? err.message : '';
      // Signup errors come pre-translated with 'signup:' prefix
      if (msg.startsWith('signup:')) {
        setError(msg.slice(7));
      } else if (msg.includes('insufficient funds') || msg.includes('gas')) {
        setError(t.voteForm.errorGas);
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        setError(t.voteForm.errorRejected);
      } else {
        setError(t.voteForm.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const stageMessages: Record<TxStage, string> = {
    idle: '',
    registering: t.voteForm.stageRegistering,
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
      { key: 'encrypting', label: t.voteForm.stageEncrypting },
      { key: 'signing', label: t.voteForm.stageSigning },
      { key: 'confirming', label: t.voteForm.stageConfirming },
      { key: 'waiting', label: t.voteForm.stageWaiting },
    ];

    return (
      <div className="bg-white p-8 border-4 border-black" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>
        <TransactionModal
          title={t.voteForm.processing}
          steps={txSteps}
          currentStep={txStage}
          subtitle={stageMessages[txStage]}
        />
      </div>
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
    <div className="bg-white p-8 border-4 border-black flex flex-col gap-10 sticky top-32" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>

      {/* Vote history banner */}
      {hasVoted && lastVote && (
        <div className="flex flex-col gap-2 px-4 py-3 bg-slate-50 border-2 border-black/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-slate-500" aria-hidden="true">info</span>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{t.voteHistory.alreadyVoted}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] font-mono text-slate-600">
            <span>{t.voteHistory.lastChoice}: <strong className="text-black">{lastVote.choice === 1 ? t.voteForm.for : t.voteForm.against}</strong></span>
            <span>{t.voteHistory.lastWeight}: <strong className="text-black">{lastVote.weight}</strong></span>
            <span>{t.voteHistory.lastCost}: <strong className="text-black">{lastVote.cost}</strong></span>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">{t.voteHistory.overrideWarning}</p>
        </div>
      )}

      {/* Auto-register notice for first-time voters */}
      {!isRegistered && !hasVoted && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border-2 border-blue-200">
          <span className="material-symbols-outlined text-[16px] text-blue-500" aria-hidden="true">info</span>
          <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wide">{t.voteForm.autoRegisterNotice}</span>
        </div>
      )}

      {/* CHOOSE DIRECTION */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
          <span className="w-2 h-2 bg-[#0052FF]"></span>
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
            <span className="w-2 h-2 bg-[#0052FF]"></span>
            {t.voteForm.weightLabel}
          </h3>
          <span className="text-[10px] font-mono font-bold bg-black text-white px-2 py-1 uppercase">{t.voteFormExtra.quadraticScaling}</span>
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
            max={MAX_WEIGHT * MAX_WEIGHT}
            step="1"
            value={cost}
            onChange={(e) => {
              const newCost = Number(e.target.value);
              setWeight(Math.max(1, Math.round(Math.sqrt(newCost))));
            }}
            disabled={isSubmitting}
            aria-describedby="vote-cost"
          />
          <div className="flex justify-between mt-4 text-[10px] font-bold text-slate-400 font-mono">
            <span>{t.voteFormExtra.minCredit}</span>
            <span>{t.voteFormExtra.maxCredits.replace('{n}', String(MAX_WEIGHT * MAX_WEIGHT))}</span>
          </div>
        </div>
      </div>

      {/* Cost / Remaining grid */}
      <div className="grid grid-cols-2 gap-px bg-black border-2 border-black">
        <div className="bg-slate-50 p-6 flex flex-col">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{t.voteForm.cost}</h3>
          <span className="text-xs font-bold text-slate-500 mb-1">{t.voteForm.weightLabel}: {weight}&sup2;</span>
          <span className="text-2xl font-mono font-bold text-emerald-500">{cost}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase mt-1">{t.voteForm.credits}</span>
        </div>
        <div className="bg-slate-50 p-6 flex flex-col">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{t.voteForm.myCredits}</h3>
          <span className="text-xs font-bold text-slate-500 mb-1">{creditsRemaining} / {voiceCredits}</span>
          <span className={`text-2xl font-mono font-bold ${creditsRemaining - cost < 0 ? 'text-red-500' : 'text-black'}`}>{Math.max(0, creditsRemaining - cost)}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase mt-1">{t.voteHistory.creditsRemaining}</span>
        </div>
      </div>

      {/* Credit exceeded warning */}
      {creditExceeded && (
        <p className="text-sm font-bold text-red-600 uppercase tracking-wide text-center" role="alert">
          {t.voteForm.creditExceeded}
        </p>
      )}

      {/* Submit */}
      <div className="pt-4">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={choice === null || isSubmitting || !address || creditExceeded}
          className="w-full bg-[#0052FF] text-white py-6 font-display font-black uppercase italic text-2xl tracking-widest border-2 border-black hover:translate-y-[-2px] hover:translate-x-[-2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:translate-x-0"
          style={{ boxShadow: '4px 4px 0px 0px rgba(0, 82, 255, 1)' }}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? t.voteForm.submitting : t.voteForm.submit}
        </button>
        <div className="flex items-center justify-center gap-2 mt-6 py-3 bg-slate-50 border border-black/10">
          <span className="material-symbols-outlined text-[16px] text-green-600">lock</span>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
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
            className="font-mono text-xs text-[#0052FF] underline"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-6)}
          </a>
          <p className="text-[11px] font-bold text-slate-500 text-center">{t.voteForm.successNext}</p>
        </div>
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

// Vote history read is in voteUtils.ts (shared with MACIVotingDemo)

function saveLastVote(address: string, pollId: number, choice: number, weight: number, cost: number): void {
  const key = `maci-lastVote-${address}-${pollId}`;
  localStorage.setItem(key, JSON.stringify({ choice, weight, cost }));
}

// Credit tracking (localStorage)
function getCreditsSpent(address: string, pollId: number): number {
  const key = `maci-creditsSpent-${address}-${pollId}`;
  return parseInt(localStorage.getItem(key) || '0', 10);
}

function setCreditsSpent(address: string, pollId: number, cost: number): void {
  const key = `maci-creditsSpent-${address}-${pollId}`;
  // Replace (not accumulate): in MACI, re-votes override previous votes,
  // so only the latest vote's cost counts as spent credits.
  localStorage.setItem(key, String(cost));
}

function getStateIndex(address: string, _pollId: number): number {
  const globalKey = `maci-stateIndex-${address}`;
  const globalVal = localStorage.getItem(globalKey);
  if (globalVal) return parseInt(globalVal, 10);
  const pollKey = `maci-stateIndex-${address}-${_pollId}`;
  const pollVal = localStorage.getItem(pollKey);
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
  const pollSkKey = `maci-sk-${address}-${pollId}`;
  const pollPkKey = `maci-pubkey-${address}-${pollId}`;
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

  const globalSkKey = `maci-sk-${address}`;
  const globalPkKey = `maci-pk-${address}`;
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

  const encoder = new TextEncoder();
  const seedData = encoder.encode(`maci-keypair-${address}-${pollId}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', seedData);
  const seed = new Uint8Array(hashBuffer);
  const sk = derivePrivateKey(seed);
  const pubKey = await eddsaDerivePublicKey(sk);

  await storeEncrypted(pollSkKey, sk.toString(), address);
  localStorage.setItem(pollPkKey, JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
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
