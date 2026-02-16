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
import { useWriteContract, useAccount } from 'wagmi';
import { POLL_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';
import { VoteConfirmModal } from './VoteConfirmModal';
import { TransactionModal } from './TransactionModal';
import { preloadCrypto } from '../../crypto/preload';

interface VoteFormV2Props {
  pollId: number;
  pollAddress: `0x${string}`;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  voiceCredits?: number;
  isExpired?: boolean;
  isRegistered?: boolean;
  onSignUp?: () => Promise<void>;
  onVoteSubmitted?: () => void;
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

      const salt = BigInt(Math.floor(Math.random() * 2 ** 250));

      const poseidon = await crypto.buildPoseidon();
      const F = poseidon.F;
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

      const ciphertext = await crypto.poseidonEncrypt(plaintext, sharedKey, nonce);

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
      incrementNonce(address, pollId);
      saveLastVote(address, pollId, choice, weight, cost);
      addCreditsSpent(address, pollId, cost);

      // Wait a bit then mark done
      setTimeout(() => setTxStage('done'), 3000);
      onVoteSubmitted?.();
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
      <div className="vote-form-v2">
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
      <div className="vote-form-v2">
        <div className="vote-expired-notice">
          <span className="material-symbols-outlined" aria-hidden="true">timer_off</span>
          <p>{t.timer.ended}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-form-v2">
      <h3>{t.voteForm.title}</h3>
      <p className="vote-form-desc">{t.voteForm.desc}</p>

      {/* Vote history banner */}
      {hasVoted && lastVote && (
        <div className="vote-history-banner">
          <div className="vote-history-header">
            <span className="material-symbols-outlined" aria-hidden="true">info</span>
            <span>{t.voteHistory.alreadyVoted}</span>
          </div>
          <div className="vote-history-details">
            <span>{t.voteHistory.lastChoice}: <strong>{lastVote.choice === 1 ? t.voteForm.for : t.voteForm.against}</strong></span>
            <span>{t.voteHistory.lastWeight}: <strong>{lastVote.weight}</strong></span>
            <span>{t.voteHistory.lastCost}: <strong>{lastVote.cost}</strong></span>
          </div>
          <p className="vote-history-warning">{t.voteHistory.overrideWarning}</p>
        </div>
      )}

      {/* Voice credit balance */}
      <div className="credit-balance">
        <span className="credit-balance-label">
          {t.voteForm.myCredits}
          <button
            type="button"
            className="tooltip-btn"
            onClick={(e) => { const el = e.currentTarget.nextElementSibling; if (el) el.classList.toggle('visible'); }}
            aria-label="Info"
          >
            <span className="material-symbols-outlined">help</span>
          </button>
          <span className="tooltip-text">{t.voteForm.creditsTooltip}</span>
        </span>
        <span className="credit-balance-value">
          {creditsRemaining} / {voiceCredits}
          {creditsSpent > 0 && <span className="credits-spent"> ({t.voteHistory.creditsRemaining})</span>}
        </span>
      </div>

      {/* Auto-register notice for first-time voters */}
      {!isRegistered && (
        <div className="auto-register-notice">
          <span className="material-symbols-outlined" aria-hidden="true">info</span>
          <span>{t.voteForm.autoRegisterNotice}</span>
        </div>
      )}

      {/* Choice buttons - large, distinct */}
      <div className="choices" role="radiogroup" aria-label={t.voteForm.title}>
        <button
          className={`choice-btn choice-against ${choice === 0 ? 'selected' : ''}`}
          onClick={() => setChoice(0)}
          disabled={isSubmitting}
          role="radio"
          aria-checked={choice === 0}
        >
          <span className="choice-icon" aria-hidden="true">✕</span>
          <span className="choice-label">{t.voteForm.against}</span>
        </button>
        <button
          className={`choice-btn choice-for ${choice === 1 ? 'selected' : ''}`}
          onClick={() => setChoice(1)}
          disabled={isSubmitting}
          role="radio"
          aria-checked={choice === 1}
        >
          <span className="choice-icon" aria-hidden="true">✓</span>
          <span className="choice-label">{t.voteForm.for}</span>
        </button>
      </div>

      {/* Weight slider */}
      <div className="weight-section">
        <label htmlFor="vote-weight">
          {t.voteForm.weightLabel}
          <button
            type="button"
            className="tooltip-btn"
            onClick={(e) => { const el = e.currentTarget.nextElementSibling; if (el) el.classList.toggle('visible'); }}
            aria-label="Info"
          >
            <span className="material-symbols-outlined">help</span>
          </button>
          <span className="tooltip-text">{t.voteForm.weightTooltip}</span>
        </label>
        <div className="weight-slider-row">
          <input
            id="vote-weight"
            type="range"
            min="1"
            max={MAX_WEIGHT}
            step="1"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            disabled={isSubmitting}
            aria-describedby="vote-cost"
          />
          <span className="weight-value">{weight}</span>
        </div>
        <div className="weight-cost-display" id="vote-cost">
          <span className="cost-label">{t.voteForm.cost}</span>
          <span className="cost-value">
            {cost} {t.voteForm.credits}
          </span>
          <span className="cost-formula">({weight} × {weight} = {cost})</span>
        </div>
        {creditExceeded && <span className="cost-warning cost-exceeded" role="alert">{t.voteForm.creditExceeded}</span>}
      </div>

      {/* Submit button - prominent */}
      <button
        onClick={() => setShowConfirm(true)}
        disabled={choice === null || isSubmitting || !address || creditExceeded}
        className="vote-submit-btn"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? t.voteForm.submitting : t.voteForm.submit}
      </button>

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
        <div className="error-with-retry" role="alert">
          <p className="error">{error}</p>
          <button className="retry-btn" onClick={() => { setError(null); setTxStage('idle'); }}>
            {t.voteForm.retry}
          </button>
        </div>
      )}
      {txHash && txStage === 'done' && (
        <div className="vote-success" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <span>{t.voteForm.success}</span>
          <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
            {txHash.slice(0, 10)}...{txHash.slice(-6)}
          </a>
          <p className="success-next">{t.voteForm.successNext}</p>
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

// Vote history (localStorage)
export function getLastVote(address: string, pollId: number): { choice: number; weight: number; cost: number } | null {
  const key = `maci-lastVote-${address}-${pollId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

function saveLastVote(address: string, pollId: number, choice: number, weight: number, cost: number): void {
  const key = `maci-lastVote-${address}-${pollId}`;
  localStorage.setItem(key, JSON.stringify({ choice, weight, cost }));
}

// Credit tracking (localStorage)
function getCreditsSpent(address: string, pollId: number): number {
  const key = `maci-creditsSpent-${address}-${pollId}`;
  return parseInt(localStorage.getItem(key) || '0', 10);
}

function addCreditsSpent(address: string, pollId: number, cost: number): void {
  const key = `maci-creditsSpent-${address}-${pollId}`;
  const current = getCreditsSpent(address, pollId);
  localStorage.setItem(key, String(current + cost));
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
      const parsed = JSON.parse(storedPk);
      return { sk, pubKey: [BigInt(parsed[0]), BigInt(parsed[1])] };
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
      const parsed = JSON.parse(storedPk);
      return { sk, pubKey: [BigInt(parsed[0]), BigInt(parsed[1])] };
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
