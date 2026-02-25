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

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useBalance, useReadContract } from 'wagmi';
import { formatEther, type PublicClient } from 'viem';
import { writeContract } from '../../writeHelper';
import { POLL_ABI, VOICE_CREDIT_PROXY_ADDRESS, ERC20_VOICE_CREDIT_PROXY_ABI, MACI_V2_ADDRESS, MACI_ABI, MACI_DEPLOY_BLOCK, DEFAULT_COORD_PUB_KEY_X, DEFAULT_COORD_PUB_KEY_Y } from '../../contractV2';
import { useTranslation } from '../../i18n';
import { VoteConfirmModal } from './VoteConfirmModal';
import { TransactionModal } from './TransactionModal';
import { preloadCrypto } from '../../crypto/preload';
import type { CryptoModules } from '../../crypto/preload';
import { getLastVote, getMaciNonce, incrementMaciNonce } from './voteUtils';
import { storageKey } from '../../storageKeys';
import { getLogsChunked } from '../../utils/viemLogs';
import { getEthereumProvider } from '../../lib/ethereum';
import { TX_TIMEOUT_MS, SHA256_SCALAR_MASK, CMD_BITS } from '../../constants/voting';
import { estimateGasWithBuffer } from '../../utils/gas';
import { ToastContainer, type ToastItem } from '../Toast';

interface VoteFormV2Props {
  pollId: number;
  pollAddress: `0x${string}`;
  voiceCredits?: number;
  isExpired?: boolean;
  onVoteSubmitted?: (txHash: string) => void;
}

type TxStage = 'idle' | 'registering' | 'keyChanging' | 'encrypting' | 'signing' | 'confirming' | 'waiting' | 'done' | 'error';

export function VoteFormV2({
  pollId,
  pollAddress,
  voiceCredits = 100,
  isExpired = false,
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { t } = useTranslation();

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS;

  // Read coordinator keys from poll contract (with defaults while loading)
  const { data: coordPubKeyXRaw } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'coordinatorPubKeyX',
    query: { enabled: !!pollAddress },
  });
  const { data: coordPubKeyYRaw } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'coordinatorPubKeyY',
    query: { enabled: !!pollAddress },
  });
  const coordinatorPubKeyX =
    coordPubKeyXRaw !== undefined ? BigInt(coordPubKeyXRaw as bigint) : DEFAULT_COORD_PUB_KEY_X;
  const coordinatorPubKeyY =
    coordPubKeyYRaw !== undefined ? BigInt(coordPubKeyYRaw as bigint) : DEFAULT_COORD_PUB_KEY_Y;

  // Read poll deploy time (for delegation-aware re-signup check)
  const { data: deployTimeAndDurationRaw } = useReadContract({
    address: pollAddress,
    abi: POLL_ABI,
    functionName: 'getDeployTimeAndDuration',
    query: { enabled: !!pollAddress },
  });
  const pollDeployTime = deployTimeAndDurationRaw
    ? Number((deployTimeAndDurationRaw as [bigint, bigint])[0])
    : null;

  // Registration state
  const [signedUp, setSignedUp] = useState(false);
  const forceSignupRef = useRef(false);

  // Read token address from voiceCreditProxy for dynamic links
  const { data: vcTokenAddress } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: ERC20_VOICE_CREDIT_PROXY_ABI,
    functionName: 'token',
    query: { enabled: VOICE_CREDIT_PROXY_ADDRESS !== '0x0000000000000000000000000000000000000000' },
  });

  // writeContract from writeHelper.ts — bypasses wagmi connector

  // ETH balance for gas fee display
  const { data: ethBalance } = useBalance({ address });
  const ethBalanceStr = ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(4) : '—';
  const ethBalanceNum = ethBalance ? parseFloat(formatEther(ethBalance.value)) : 0;

  // Estimate gas cost on mount
  useEffect(() => {
    if (!publicClient || !pollAddress || !address) return;
    let cancelled = false;
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
        const totalCost = signedUp
          ? gasCostWei * 120n / 100n
          : gasCostWei * 280n / 100n; // signUp + publishMessage ≈ 2.8x
        if (!cancelled) setEstimatedGasEth(parseFloat(formatEther(totalCost)).toFixed(4));
      } catch (err) {
        if (process.env.NODE_ENV === 'development') console.warn('Gas estimation failed:', err);
        // Reset to null only if we had a previous value (avoids no-op setState on mount)
        if (!cancelled && estimatedGasEth !== null) setEstimatedGasEth(null);
      }
    };
    estimateGas();
    return () => { cancelled = true; };
  }, [publicClient, pollAddress, address, signedUp]);

  // Reset signup state when switching proposals or accounts
  useEffect(() => {
    setSignedUp(false);
    forceSignupRef.current = false;
  }, [pollId, address]);

  // Check if user already signed up (localStorage fast path + on-chain fallback)
  useEffect(() => {
    if (!address) return;

    const delegationChangedAtRaw = localStorage.getItem(storageKey.delegationChangedAt(address));
    const delegationChangedAt = delegationChangedAtRaw ? Number(delegationChangedAtRaw) : 0;
    const shouldForceReSignup = Boolean(
      delegationChangedAt && pollDeployTime && pollDeployTime * 1000 >= delegationChangedAt,
    );
    if (shouldForceReSignup && !forceSignupRef.current) {
      forceSignupRef.current = true;
      localStorage.removeItem(storageKey.signup(address));
      localStorage.removeItem(storageKey.pk(address));
      localStorage.removeItem(storageKey.stateIndex(address));
      setSignedUp(false);
      return;
    }

    // Fast path: check localStorage signals
    const hasSignupFlag = localStorage.getItem(storageKey.signup(address));
    const hasGlobalKey = localStorage.getItem(storageKey.pk(address));
    const hasPollKey = localStorage.getItem(storageKey.pubkey(address, pollId));
    const hasVotedFlag = parseInt(localStorage.getItem(storageKey.nonce(address, pollId)) || '1', 10) > 1;
    if (hasSignupFlag || hasGlobalKey || hasPollKey || hasVotedFlag) {
      setSignedUp(true);
      if (!hasSignupFlag) localStorage.setItem(storageKey.signup(address), 'true');
      return;
    }

    // Slow path: check on-chain SignUp events (handles cleared localStorage)
    if (!publicClient || !isConfigured) return;
    let cancelled = false;
    const checkOnChainSignUp = async () => {
      try {
        const logs = await getLogsChunked(
          publicClient,
          {
            address: MACI_V2_ADDRESS,
            event: {
              type: 'event',
              name: 'SignUp',
              inputs: [
                { name: 'stateIndex', type: 'uint256', indexed: true },
                { name: 'pubKeyX', type: 'uint256', indexed: true },
                { name: 'pubKeyY', type: 'uint256', indexed: false },
                { name: 'voiceCreditBalance', type: 'uint256', indexed: false },
                { name: 'timestamp', type: 'uint256', indexed: false },
              ],
            },
          },
          MACI_DEPLOY_BLOCK,
          'latest',
        );
        // Batch getTransaction calls in parallel chunks (avoids N sequential RPC calls)
        let lastMatch: { stateIndex: number; pubKeyX: string; pubKeyY: string } | null = null;
        const logsWithHash = logs.filter(l => l.transactionHash);
        const CHUNK = 10;
        for (let i = 0; i < logsWithHash.length; i += CHUNK) {
          if (cancelled) return;
          const chunk = logsWithHash.slice(i, i + CHUNK);
          const txs = await Promise.all(
            chunk.map(l => publicClient.getTransaction({ hash: l.transactionHash! }).catch(() => null))
          );
          for (let j = 0; j < chunk.length; j++) {
            const tx = txs[j];
            const log = chunk[j];
            if (!tx) continue;
            if (tx.from.toLowerCase() === address.toLowerCase()) {
              const rawIndex = log.topics[1] ? parseInt(log.topics[1] as string, 16) : NaN;
              const stateIndex = !isNaN(rawIndex) && rawIndex > 0 ? rawIndex : 1;
              const pubKeyX = log.topics[2] ? BigInt(log.topics[2]).toString() : '0';
              const pubKeyY = (log as unknown as { args?: { pubKeyY?: bigint } }).args?.pubKeyY?.toString() ?? '0';
              lastMatch = { stateIndex, pubKeyX, pubKeyY };
            }
          }
        }
        if (lastMatch && !cancelled) {
          localStorage.setItem(storageKey.signup(address), 'true');
          localStorage.setItem(storageKey.stateIndex(address), String(lastMatch.stateIndex));
          localStorage.setItem(storageKey.pk(address), JSON.stringify([lastMatch.pubKeyX, lastMatch.pubKeyY]));
          setSignedUp(true);
        }
      } catch {
        // On-chain check failed — leave as unregistered
      }
    };
    checkOnChainSignUp();
    return () => { cancelled = true; };
  }, [address, publicClient, isConfigured, pollId, pollDeployTime]);

  // Sign up on MACI contract
  const handleSignUp = useCallback(async () => {
    if (!address) return;
    try {
      const cm = await preloadCrypto();
      const sk = await deriveKeyFromWallet(address, cm);
      const pk = await cm.eddsaDerivePublicKey(sk);

      let hash: `0x${string}` = '0x' as `0x${string}`;
      let signUpRetries = 0;
      const maxSignUpRetries = 5;
      while (true) {
        try {
          const gas = await estimateGasWithBuffer({
            publicClient,
            address: MACI_V2_ADDRESS,
            abi: MACI_ABI,
            functionName: 'signUp',
            args: [pk[0], pk[1], '0x' as `0x${string}`, '0x' as `0x${string}`],
            account: address,
            fallbackGas: 500_000n,
          });
          hash = await writeContract({
            address: MACI_V2_ADDRESS,
            abi: MACI_ABI,
            functionName: 'signUp',
            args: [pk[0], pk[1], '0x' as `0x${string}`, '0x' as `0x${string}`],
            gas,
            account: address,
          });
          break;
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : '';
          if (
            (retryMsg.includes('underpriced') || retryMsg.includes('nonce') || retryMsg.includes('already known')) &&
            signUpRetries < maxSignUpRetries
          ) {
            signUpRetries++;
            await new Promise(r => setTimeout(r, 10_000));
            continue;
          }
          throw retryErr;
        }
      }

      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== MACI_V2_ADDRESS.toLowerCase()) continue;
            if (log.topics.length >= 2 && log.topics[0]) {
              const stateIndex = parseInt(log.topics[1] as string, 16);
              if (!isNaN(stateIndex) && stateIndex > 0) {
                localStorage.setItem(storageKey.stateIndex(address), String(stateIndex));
              }
            }
          }
        } catch {
          localStorage.setItem(storageKey.stateIndex(address), '1');
        }
      }

      localStorage.setItem(storageKey.signup(address), 'true');
      localStorage.removeItem(storageKey.delegationChangedAt(address));
      await cm.storeEncrypted(storageKey.sk(address), sk.toString(), address);
      localStorage.setItem(storageKey.pk(address), JSON.stringify([pk[0].toString(), pk[1].toString()]));
      setSignedUp(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
        throw new Error('signup:' + t.voteForm.errorRejected);
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) {
        throw new Error('signup:' + t.voteForm.errorGas);
      } else {
        const shortMsg = msg.length > 120 ? msg.slice(0, 120) + '...' : msg;
        throw new Error('signup:' + t.maci.signup.error + ' (' + shortMsg + ')');
      }
    }
  }, [address, publicClient, t]);

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

  // Toast management
  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Classify error and return user-friendly message
  const classifyError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);

    // Signup errors come pre-translated with 'signup:' prefix
    if (msg.startsWith('signup:')) {
      return msg.slice(7);
    }

    // User rejected transaction
    if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
      return t.voteErrors.cancelled;
    }

    // Insufficient gas
    if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) {
      return t.voteErrors.insufficientGas;
    }

    // Transaction timeout
    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('Timed out')) {
      return t.voteErrors.timeout;
    }

    // Encryption errors
    if (msg.includes('ECDH') || msg.includes('shared key') || msg.includes('invalid point')) {
      return t.voteErrors.encryption;
    }

    // Poll ended
    if (msg.includes('poll') && (msg.includes('ended') || msg.includes('closed') || msg.includes('expired'))) {
      return t.voteErrors.pollEnded;
    }

    // Already voted (nonce issue)
    if (msg.includes('nonce') && msg.includes('already')) {
      return t.voteErrors.alreadyVoted;
    }

    // Generic error
    return t.voteErrors.genericError;
  };

  // Capture registration state at submit time (so it doesn't change mid-flow)
  const wasRegisteredRef = useRef(true);

  const handleSubmit = async () => {
    if (choice === null || !address) return;
    wasRegisteredRef.current = signedUp;
    const isReVote = getMaciNonce(address, pollId) > 1;
    setIsSubmitting(true);
    setError(null);

    try {
      // Step 0: Auto-register if not yet signed up
      if (!signedUp) {
        setTxStage('registering');
        await handleSignUp();
      }

      setTxStage('encrypting');
      const cm = await preloadCrypto();
      const poseidon = await cm.buildPoseidon();

      // Get current keypair (poll-specific > global > wallet-derived)
      let { sk: currentSk, pubKey: currentPubKey } = await getOrCreateMaciKeypair(
        address, pollId, cm.derivePrivateKey, cm.eddsaDerivePublicKey, cm.loadEncrypted, cm.storeEncrypted,
      );

      // Verify local key matches on-chain registered key; re-register on mismatch
      const storedPk = localStorage.getItem(storageKey.pk(address));
      if (storedPk) {
        try {
          const parsed = JSON.parse(storedPk);
          if (parsed[0].toString() !== currentPubKey[0].toString() || parsed[1].toString() !== currentPubKey[1].toString()) {
            {
              setTxStage('registering');
              await handleSignUp();
              const fresh = await getOrCreateMaciKeypair(
                address, pollId, cm.derivePrivateKey, cm.eddsaDerivePublicKey, cm.loadEncrypted, cm.storeEncrypted,
              );
              currentSk = fresh.sk;
              currentPubKey = fresh.pubKey;
            }
          }
        } catch {
          // Parsing failed — proceed with current key
        }
      }

      const resolvedStateIndex = await resolveStateIndexFromLogs(publicClient ?? null, address, currentPubKey);
      if (!resolvedStateIndex) throw new Error('State index not found for registered key');

      let voteSk = currentSk;
      let votePubKey = currentPubKey;

      // --- Step A: Key change on re-vote ---
      // Invalidates previous vote by rotating to a fresh keypair before voting again.
      if (isReVote) {
        setTxStage('keyChanging');
        const seed = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const newSk = cm.derivePrivateKey(seed);
        const newPubKey = await cm.eddsaDerivePublicKey(newSk);
        const stateIndex = BigInt(resolvedStateIndex);

        const { encMessage: kcMsg, ephemeralPubKey: kcEphPubKey } = await buildEncryptedMessage({
          cm, poseidon,
          stateIndex,
          pubKeyX: newPubKey[0], pubKeyY: newPubKey[1],
          voteOption: 0n, voteWeight: 0n,
          signerSk: currentSk,
          nonce: BigInt(getMaciNonce(address, pollId)),
          pollId, coordinatorPubKeyX, coordinatorPubKeyY,
        });

        setTxStage('confirming');
        const kcHash = await publishWithRetry(pollAddress, kcMsg, kcEphPubKey, address, setTxStage, publicClient ?? undefined);
        setTxStage('waiting');
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: kcHash, timeout: TX_TIMEOUT_MS });
          if (receipt.status === 'reverted') throw new Error('Key change transaction reverted on-chain');
        }

        localStorage.setItem(storageKey.pubkey(address, pollId), JSON.stringify([newPubKey[0].toString(), newPubKey[1].toString()]));
        await cm.storeEncrypted(storageKey.skPoll(address, pollId), newSk.toString(), address);
        incrementMaciNonce(address, pollId);
        voteSk = newSk;
        votePubKey = newPubKey;
      }

      // --- Step B: Send vote message ---
      setTxStage('encrypting');
      const stateIndex = BigInt(resolvedStateIndex);

      const { encMessage, ephemeralPubKey } = await buildEncryptedMessage({
        cm, poseidon,
        stateIndex,
        pubKeyX: votePubKey[0], pubKeyY: votePubKey[1],
        voteOption: BigInt(choice), voteWeight: BigInt(weight),
        signerSk: voteSk,
        nonce: BigInt(getMaciNonce(address, pollId)),
        pollId, coordinatorPubKeyX, coordinatorPubKeyY,
        onBeforeSigning: () => setTxStage('signing'),
      });

      setTxStage('confirming');
      if (!address) { setError(t.maci.connectWallet); setTxStage('error'); setIsSubmitting(false); return; }

      const hash = await publishWithRetry(pollAddress, encMessage, ephemeralPubKey, address, setTxStage, publicClient ?? undefined);
      setTxStage('waiting');
      setTxHash(hash);

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS });
        if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain');
      }

      // Save state only after on-chain confirmation
      incrementMaciNonce(address, pollId);
      saveLastVote(address, pollId, choice, weight, cost);
      setCreditsSpent(address, pollId, cost);
      onVoteSubmitted?.(hash);
      setTxStage('done');
    } catch (err) {
      // Only log error type in production — never raw error objects with keys/signatures
      if (process.env.NODE_ENV === 'development') console.error('Vote error:', err);
      setTxStage('error');
      const errorMessage = classifyError(err);
      setError(errorMessage);
      addToast(errorMessage, 'error');
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
      <>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <TransactionModal
          title={t.voteForm.processing}
          steps={txSteps}
          currentStep={txStage}
          subtitle={stageMessages[txStage]}
        />
      </>
    );
  }

  // Poll expired
  if (isExpired) {
    return (
      <>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <div className="bg-white p-8 border-4 border-black flex flex-col gap-10" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-300">timer_off</span>
            <p className="font-display font-bold text-xl uppercase mt-4">{t.timer.ended}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="bg-white p-4 sm:p-6 md:p-8 border-4 border-black flex flex-col gap-6 sm:gap-8 md:gap-10 md:sticky md:top-32" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>

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
      {!signedUp && !hasVoted && (
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
            href={`https://sepolia.etherscan.io/address/${vcTokenAddress || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-primary underline"
          >
            {t.createPoll.getTokens}
          </a>
        </div>
      )}

      {/* CHOOSE DIRECTION */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-4 sm:mb-6 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary"></span>
          {t.voteForm.title}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:gap-4" role="radiogroup" aria-label={t.voteForm.title}>
          <button
            className={`border-2 border-black py-4 sm:py-6 font-black text-sm sm:text-lg uppercase tracking-widest flex flex-col items-center justify-center gap-1 transition-all ${
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
            <span className="material-symbols-outlined text-2xl sm:text-3xl">add_circle</span>
            {t.voteForm.for}
          </button>
          <button
            className={`border-2 border-black py-4 sm:py-6 font-black text-sm sm:text-lg uppercase tracking-widest flex flex-col items-center justify-center gap-1 transition-all ${
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
            <span className="material-symbols-outlined text-2xl sm:text-3xl">remove_circle</span>
            {t.voteForm.against}
          </button>
        </div>
      </div>

      {/* VOTE INTENSITY */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-4 sm:mb-6">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-2 h-2 bg-primary"></span>
            {t.voteForm.weightLabel}
          </h3>
          <span className="text-[10px] sm:text-xs font-mono font-bold bg-black text-white px-2 py-1 uppercase">{t.voteForm.cost} = {t.voteForm.weightLabel}²</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <button
            className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-black flex items-center justify-center font-bold text-xl sm:text-2xl hover:bg-slate-100 transition-colors shrink-0"
            onClick={() => setWeight(Math.max(1, weight - 1))}
            disabled={isSubmitting || weight <= 1}
          >
            -
          </button>
          <div className="flex-1 h-12 sm:h-16 border-2 border-black flex items-center justify-center font-mono font-bold text-3xl sm:text-4xl bg-slate-50">
            {weight}
          </div>
          <button
            className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-black flex items-center justify-center font-bold text-xl sm:text-2xl hover:bg-slate-100 transition-colors shrink-0"
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
        {!signedUp && (
          <p className="text-xs font-mono text-amber-600 pt-1">{t.voteForm.firstVoteNote}</p>
        )}
        {estimatedGasEth && ethBalanceNum < parseFloat(estimatedGasEth) && (
          <p className="text-xs font-bold text-red-500 pt-1">{t.voteForm.lowBalance}</p>
        )}
      </div>

      {/* Submit */}
      <div className="pt-2 sm:pt-4">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={choice === null || isSubmitting || !address || creditExceeded}
          className="w-full bg-primary text-white py-4 sm:py-6 font-display font-black uppercase italic text-xl sm:text-2xl tracking-widest border-2 border-black hover:translate-y-[-2px] hover:translate-x-[-2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:translate-x-0"
          style={{ boxShadow: '4px 4px 0px 0px rgba(37, 99, 235, 1)' }}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? t.voteForm.submitting : t.voteForm.submit}
        </button>
        <div className="flex items-center justify-center gap-2 mt-4 sm:mt-6 py-3 bg-slate-50 border border-black/10">
          <span className="material-symbols-outlined text-[16px] text-green-600">lock</span>
          <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest text-center">
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
    </>
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

async function resolveStateIndexFromLogs(
  publicClient: PublicClient | null,
  address: string,
  pubKey: [bigint, bigint],
): Promise<number | null> {
  const cached = localStorage.getItem(storageKey.stateIndex(address));
  if (cached) return parseInt(cached, 10);
  if (!publicClient) return null;

  try {
    const logs = await getLogsChunked(
      publicClient,
      {
        address: MACI_V2_ADDRESS,
        event: {
          type: 'event',
          name: 'SignUp',
          inputs: [
            { name: 'stateIndex', type: 'uint256', indexed: true },
            { name: 'pubKeyX', type: 'uint256', indexed: true },
            { name: 'pubKeyY', type: 'uint256', indexed: false },
            { name: 'voiceCreditBalance', type: 'uint256', indexed: false },
            { name: 'timestamp', type: 'uint256', indexed: false },
          ],
        },
        args: { pubKeyX: pubKey[0] },
      },
      MACI_DEPLOY_BLOCK,
      'latest',
    );

    let lastMatch: number | null = null;
    for (const log of logs) {
      const args = (log as unknown as { args?: { stateIndex?: bigint; pubKeyY?: bigint } }).args;
      const pubKeyY = args?.pubKeyY?.toString() ?? '0';
      if (pubKeyY !== pubKey[1].toString()) continue;
      const stateIndex = args?.stateIndex ? Number(args.stateIndex) : (
        log.topics?.[1] ? parseInt(log.topics[1] as string, 16) : NaN
      );
      if (!Number.isNaN(stateIndex) && stateIndex > 0) {
        lastMatch = stateIndex;
      }
    }

    if (lastMatch) {
      localStorage.setItem(storageKey.stateIndex(address), String(lastMatch));
      localStorage.setItem(storageKey.pk(address), JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
      return lastMatch;
    }
  } catch {
    // ignore and fall through
  }
  return null;
}

const MACI_KEY_MESSAGE = 'SIGIL Voting Key v1';

/**
 * Derive MACI global private key from wallet signature.
 * Tries encrypted cache first; prompts wallet only if not cached.
 */
async function deriveKeyFromWallet(address: string, cm: CryptoModules): Promise<bigint> {
  const cached = await cm.loadEncrypted(storageKey.sk(address), address);
  if (cached) return BigInt(cached);
  const provider = getEthereumProvider();
  if (!provider) throw new Error('No wallet provider');
  const sig = await provider.request({
    method: 'personal_sign',
    params: [
      `0x${Array.from(new TextEncoder().encode(MACI_KEY_MESSAGE)).map(b => b.toString(16).padStart(2, '0')).join('')}`,
      address,
    ],
  }) as string;
  const sigHex = sig.slice(2);
  if (sigHex.length < 130) throw new Error('Invalid signature: too short');
  const sigMatches = sigHex.match(/.{2}/g);
  if (!sigMatches) throw new Error('Invalid signature format');
  const sigBytes = new Uint8Array(sigMatches.map(h => parseInt(h, 16)));
  const sk = cm.derivePrivateKey(sigBytes);
  await cm.storeEncrypted(storageKey.sk(address), sk.toString(), address);
  return sk;
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
  const provider = getEthereumProvider();
  if (!provider) throw new Error('No wallet provider');
  const sig = await provider.request({
    method: 'personal_sign',
    params: [
      `0x${Array.from(new TextEncoder().encode(MACI_KEY_MESSAGE)).map(b => b.toString(16).padStart(2, '0')).join('')}`,
      address,
    ],
  }) as string;
  const sigHex = sig.slice(2);
  if (sigHex.length < 130) throw new Error('Invalid signature: too short');
  const sigMatches = sigHex.match(/.{2}/g);
  if (!sigMatches) throw new Error('Invalid signature format');
  const sigBytes = new Uint8Array(sigMatches.map(h => parseInt(h, 16)));
  const sk = derivePrivateKey(sigBytes);
  const pubKey = await eddsaDerivePublicKey(sk);

  // Cache globally (not per-poll, since wallet signature is always the same)
  await storeEncrypted(globalSkKey, sk.toString(), address);
  localStorage.setItem(globalPkKey, JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]));
  return { sk, pubKey };
}

interface EncryptedMessageParams {
  cm: CryptoModules;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poseidon: any;
  stateIndex: bigint;
  pubKeyX: bigint;
  pubKeyY: bigint;
  voteOption: bigint;
  voteWeight: bigint;
  signerSk: bigint;
  nonce: bigint;
  pollId: number;
  coordinatorPubKeyX: bigint;
  coordinatorPubKeyY: bigint;
  /** Called just before EdDSA signing — use to update UI stage to 'signing'. */
  onBeforeSigning?: () => void;
}

/**
 * Builds an encrypted MACI message (key change OR vote).
 * Both share the same ECDH → pack → hash → sign → Poseidon-encrypt flow.
 *
 * Key change: voteOption=0, voteWeight=0, pubKey=newKey, signerSk=currentSk
 * Vote:       voteOption=choice, voteWeight=weight, pubKey=current/newKey, signerSk=voteSk
 */
async function buildEncryptedMessage({
  cm, poseidon,
  stateIndex, pubKeyX, pubKeyY,
  voteOption, voteWeight,
  signerSk, nonce, pollId,
  coordinatorPubKeyX, coordinatorPubKeyY,
  onBeforeSigning,
}: EncryptedMessageParams): Promise<{ encMessage: bigint[]; ephemeralPubKey: [bigint, bigint] }> {
  let ephemeral: Awaited<ReturnType<typeof cm.generateEphemeralKeyPair>>;
  let sharedKey: Awaited<ReturnType<typeof cm.generateECDHSharedKey>>;
  try {
    ephemeral = await cm.generateEphemeralKeyPair();
    sharedKey = await cm.generateECDHSharedKey(ephemeral.sk, [coordinatorPubKeyX, coordinatorPubKeyY]);
  } catch (e) {
    throw new Error('ECDH key exchange failed: ' + (e instanceof Error ? e.message : String(e)));
  }

  const packedCommand = packCommand(stateIndex, voteOption, voteWeight, nonce, BigInt(pollId));

  const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const salt = BigInt('0x' + Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('')) & SHA256_SCALAR_MASK;

  // cmdHash must match circuit: Poseidon(stateIndex, pubKeyX, pubKeyY, voteWeight, salt)
  const F = poseidon.F;
  const cmdHashF = poseidon([F.e(stateIndex), F.e(pubKeyX), F.e(pubKeyY), F.e(voteWeight), F.e(salt)]);
  const cmdHash = F.toObject(cmdHashF);

  onBeforeSigning?.();
  const signature = await cm.eddsaSign(cmdHash, signerSk);

  const plaintext = [packedCommand, pubKeyX, pubKeyY, salt, signature.R8[0], signature.R8[1], signature.S];
  const ciphertext = await cm.poseidonEncrypt(plaintext, sharedKey, 0n);

  const encMessage: bigint[] = new Array(10).fill(0n);
  for (let i = 0; i < Math.min(ciphertext.length, 10); i++) {
    encMessage[i] = ciphertext[i];
  }
  return { encMessage, ephemeralPubKey: ephemeral.pubKey };
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
    (voteOptionIndex << CMD_BITS.VOTE_OPTION) |
    (newVoteWeight << CMD_BITS.WEIGHT) |
    (nonce << CMD_BITS.NONCE) |
    (pollId << CMD_BITS.POLL_ID)
  );
}

async function publishWithRetry(
  pollAddress: `0x${string}`,
  encMessage: bigint[],
  ephemeralPubKey: [bigint, bigint],
  account: `0x${string}`,
  setTxStage: (stage: TxStage) => void,
  publicClient?: PublicClient,
  maxRetries = 5,
): Promise<`0x${string}`> {
  let retries = 0;
  while (true) {
    try {
      const gas = await estimateGasWithBuffer({
        publicClient,
        address: pollAddress,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          ephemeralPubKey[0],
          ephemeralPubKey[1],
        ],
        account,
        fallbackGas: 1_200_000n,
      });
      const hash = await writeContract({
        address: pollAddress,
        abi: POLL_ABI,
        functionName: 'publishMessage',
        args: [
          encMessage as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
          ephemeralPubKey[0],
          ephemeralPubKey[1],
        ],
        gas,
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
