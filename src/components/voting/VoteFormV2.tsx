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

import { useState } from 'react';
import { useWriteContract, useAccount } from 'wagmi';
import { POLL_ABI } from '../../contractV2';
import { useTranslation } from '../../i18n';
import { VoteConfirmModal } from './VoteConfirmModal';

interface VoteFormV2Props {
  pollId: number;
  pollAddress: `0x${string}`;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  onVoteSubmitted?: () => void;
}

type TxStage = 'idle' | 'encrypting' | 'signing' | 'confirming' | 'waiting' | 'done' | 'error';

export function VoteFormV2({
  pollId,
  pollAddress,
  coordinatorPubKeyX,
  coordinatorPubKeyY,
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

  const MAX_WEIGHT = 10;
  const cost = weight * weight;

  const handleSubmit = async () => {
    if (choice === null || !address) return;
    setIsSubmitting(true);
    setError(null);
    setTxStage('encrypting');

    try {
      const { generateEphemeralKeyPair, generateECDHSharedKey } = await import('../../crypto/ecdh');
      const { poseidonEncrypt } = await import('../../crypto/duplexSponge');
      const { eddsaSign, eddsaDerivePublicKey } = await import('../../crypto/eddsa');
      const { derivePrivateKey } = await import('../../crypto/blake512');

      const { sk: userSk, pubKey: userPubKey } = await getOrCreateMaciKeypair(
        address, pollId, derivePrivateKey, eddsaDerivePublicKey,
      );

      const ephemeral = await generateEphemeralKeyPair();

      const sharedKey = await generateECDHSharedKey(
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

      // @ts-expect-error - circomlibjs doesn't have types
      const { buildPoseidon } = await import('circomlibjs');
      const poseidon = await buildPoseidon();
      const F = poseidon.F;
      const cmdHashF = poseidon([
        F.e(stateIndex),
        F.e(userPubKey[0]),
        F.e(userPubKey[1]),
        F.e(BigInt(weight)),
        F.e(salt),
      ]);
      const cmdHash = F.toObject(cmdHashF);

      const signature = await eddsaSign(cmdHash, userSk);

      const plaintext = [
        packedCommand,
        userPubKey[0],
        userPubKey[1],
        salt,
        signature.R8[0],
        signature.R8[1],
        signature.S,
      ];

      const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);

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

      // Wait a bit then mark done
      setTimeout(() => setTxStage('done'), 3000);
      onVoteSubmitted?.();
    } catch (err) {
      setTxStage('error');
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('insufficient funds') || msg.includes('gas')) {
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
    encrypting: t.voteForm.stageEncrypting,
    signing: t.voteForm.stageSigning,
    confirming: t.voteForm.stageConfirming,
    waiting: t.voteForm.stageWaiting,
    done: t.voteForm.stageDone,
    error: '',
  };

  // Transaction progress modal
  if (txStage !== 'idle' && txStage !== 'done' && txStage !== 'error') {
    return (
      <div className="vote-form-v2">
        <div className="tx-progress-modal">
          <div className="tx-progress-spinner" aria-hidden="true">
            <span className="spinner-large" />
          </div>
          <h3>{t.voteForm.processing}</h3>
          <p className="tx-stage-text">{stageMessages[txStage]}</p>
          <div className="tx-progress-steps">
            <div className={`tx-step ${txStage === 'encrypting' ? 'active' : 'done'}`}>
              <span className="tx-step-icon">{txStage === 'encrypting' ? '◉' : '✓'}</span>
              <span>{t.voteForm.stageEncrypting}</span>
            </div>
            <div className={`tx-step ${txStage === 'signing' ? 'active' : txStage === 'encrypting' ? 'pending' : 'done'}`}>
              <span className="tx-step-icon">{txStage === 'signing' ? '◉' : txStage === 'encrypting' ? '○' : '✓'}</span>
              <span>{t.voteForm.stageSigning}</span>
            </div>
            <div className={`tx-step ${txStage === 'confirming' ? 'active' : ['encrypting', 'signing'].includes(txStage) ? 'pending' : 'done'}`}>
              <span className="tx-step-icon">{txStage === 'confirming' ? '◉' : ['encrypting', 'signing'].includes(txStage) ? '○' : '✓'}</span>
              <span>{t.voteForm.stageConfirming}</span>
            </div>
            <div className={`tx-step ${txStage === 'waiting' ? 'active' : 'pending'}`}>
              <span className="tx-step-icon">{txStage === 'waiting' ? '◉' : '○'}</span>
              <span>{t.voteForm.stageWaiting}</span>
            </div>
          </div>
          <p className="tx-patience">{t.voteForm.patience}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-form-v2">
      <h3>{t.voteForm.title}</h3>
      <p className="vote-form-desc">{t.voteForm.desc}</p>

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
        <label htmlFor="vote-weight">{t.voteForm.weightLabel}</label>
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
          <span className={`cost-value ${cost > 25 ? 'cost-high' : cost > 9 ? 'cost-medium' : ''}`}>
            {cost} {t.voteForm.credits}
          </span>
          <span className="cost-formula">({weight} × {weight} = {cost})</span>
        </div>
        {cost > 25 && <span className="cost-warning" role="alert">{t.voteForm.costWarning}</span>}
      </div>

      {/* Submit button - prominent */}
      <button
        onClick={() => setShowConfirm(true)}
        disabled={choice === null || isSubmitting || !address}
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

      {error && <p className="error" role="alert">{error}</p>}
      {txHash && txStage === 'done' && (
        <div className="vote-success" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <span>{t.voteForm.success}</span>
          <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
            {txHash.slice(0, 10)}...{txHash.slice(-6)}
          </a>
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
): Promise<{ sk: bigint; pubKey: [bigint, bigint] }> {
  const { loadEncrypted, storeEncrypted } = await import('../../crypto/keyStore');

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
