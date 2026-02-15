/**
 * VoteFormV2 - MACI Encrypted Voting Form
 *
 * Quadratic voting: voters choose For/Against and pick their vote weight.
 * Cost = weight² credits. Weight 1 = simple vote. Weight 3 = 9 credits.
 *
 * Flow:
 *   1. User selects vote choice (For / Against)
 *   2. User picks vote weight (default 1)
 *   3. BLAKE512 key derivation -> ECDH -> DuplexSponge encryption
 *   4. EdDSA-Poseidon signature
 *   5. Binary command packing
 *   6. Poll.publishMessage(encMessage, encPubKey)
 */

import { useState } from 'react';
import { useWriteContract, useAccount } from 'wagmi';
import { POLL_ABI, POLL_V2_ADDRESS } from '../../contractV2';
import { useTranslation } from '../../i18n';

interface VoteFormV2Props {
  pollId: number;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  onVoteSubmitted?: () => void;
}

export function VoteFormV2({
  pollId,
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
  const { t } = useTranslation();

  const { writeContractAsync } = useWriteContract();

  const choices = [
    { value: 0, label: t.voteForm.against },
    { value: 1, label: t.voteForm.for },
  ];

  const weightNum = parseInt(weight || '1', 10) || 1;
  const cost = weightNum * weightNum;

  const handleSubmit = async () => {
    if (choice === null || !address) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const { generateEphemeralKeyPair, generateECDHSharedKey } = await import('../../crypto/ecdh');
      const { poseidonEncrypt } = await import('../../crypto/duplexSponge');
      const { eddsaSign, eddsaDerivePublicKey } = await import('../../crypto/eddsa');
      const { derivePrivateKey } = await import('../../crypto/blake512');

      // 1. Get or create MACI keypair for this user
      const { sk: userSk, pubKey: userPubKey } = await getOrCreateMaciKeypair(
        address, pollId, derivePrivateKey, eddsaDerivePublicKey,
      );

      // 2. Generate ephemeral key pair for ECDH
      const ephemeral = await generateEphemeralKeyPair();

      // 3. ECDH shared key with coordinator (returns [x, y] point)
      const sharedKey = await generateECDHSharedKey(
        ephemeral.sk,
        [coordinatorPubKeyX, coordinatorPubKeyY],
      );

      // 4. Pack command
      const nonce = BigInt(getNonce(address, pollId));
      const stateIndex = BigInt(getStateIndex(address, pollId));
      const packedCommand = packCommand(
        stateIndex,
        BigInt(choice),
        BigInt(weight),
        nonce,
        BigInt(pollId),
      );

      // 5. Compute command hash for EdDSA signature
      // Hash: Poseidon(stateIndex, newPubKeyX, newPubKeyY, newVoteWeight, salt)
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

      // 6. EdDSA-Poseidon signature
      const signature = await eddsaSign(cmdHash, userSk);

      // 7. Compose plaintext: [packedCmd, newPubKeyX, newPubKeyY, salt, sigR8x, sigR8y, sigS]
      const plaintext = [
        packedCommand,
        userPubKey[0],
        userPubKey[1],
        salt,
        signature.R8[0],
        signature.R8[1],
        signature.S,
      ];

      // 8. DuplexSponge encrypt
      const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);

      // Ciphertext should be exactly 10 fields (7 -> pad to 9, + 1 auth tag)
      const encMessage: bigint[] = new Array(10).fill(0n);
      for (let i = 0; i < Math.min(ciphertext.length, 10); i++) {
        encMessage[i] = ciphertext[i];
      }

      // 9. Submit to Poll contract
      const hash = await writeContractAsync({
        address: POLL_V2_ADDRESS,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage.map((v) => v) as any,
          ephemeral.pubKey[0],
          ephemeral.pubKey[1],
        ],
      });

      setTxHash(hash);
      incrementNonce(address, pollId);
      onVoteSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.voteForm.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="vote-form-v2">
      <h3>{t.voteForm.title}</h3>
      <p className="text-sm text-gray-500">{t.voteForm.desc}</p>

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

      <div className="weight-input">
        <label>{t.voteForm.weightLabel}</label>
        <input
          type="number"
          min="1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          disabled={isSubmitting}
        />
        <span className="cost">
          {t.voteForm.cost} {cost} {t.voteForm.credits}
        </span>
      </div>

      <button
        onClick={handleSubmit}
        disabled={choice === null || isSubmitting || !address}
        className="submit-btn"
      >
        {isSubmitting ? t.voteForm.submitting : t.voteForm.submit}
      </button>

      {error && <p className="error">{error}</p>}
      {txHash && (
        <p className="success">
          {t.voteForm.success} {txHash.slice(0, 10)}...
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

// State index management (localStorage) — set after MACI signUp
function getStateIndex(address: string, pollId: number): number {
  const key = `maci-stateIndex-${address}-${pollId}`;
  return parseInt(localStorage.getItem(key) || '0', 10);
}

// MACI keypair management
async function getOrCreateMaciKeypair(
  address: string,
  pollId: number,
  derivePrivateKey: (seed: Uint8Array) => bigint,
  eddsaDerivePublicKey: (sk: bigint) => Promise<[bigint, bigint]>,
): Promise<{ sk: bigint; pubKey: [bigint, bigint] }> {
  const skKey = `maci-sk-${address}-${pollId}`;
  const pkKey = `maci-pubkey-${address}-${pollId}`;

  const storedSk = localStorage.getItem(skKey);
  if (storedSk) {
    const sk = BigInt(storedSk);
    const storedPk = localStorage.getItem(pkKey);
    if (storedPk) {
      const parsed = JSON.parse(storedPk);
      return { sk, pubKey: [BigInt(parsed[0]), BigInt(parsed[1])] };
    }
    const pubKey = await eddsaDerivePublicKey(sk);
    localStorage.setItem(pkKey, JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
    return { sk, pubKey };
  }

  // Generate new keypair from deterministic seed
  const encoder = new TextEncoder();
  const seedData = encoder.encode(`maci-keypair-${address}-${pollId}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', seedData);
  const seed = new Uint8Array(hashBuffer);
  const sk = derivePrivateKey(seed);
  const pubKey = await eddsaDerivePublicKey(sk);

  localStorage.setItem(skKey, sk.toString());
  localStorage.setItem(pkKey, JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
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
