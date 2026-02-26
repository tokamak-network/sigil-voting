/**
 * Relayer API client for gasless publishMessage.
 *
 * The relayer submits Poll.publishMessage() on behalf of the voter.
 * Since publishMessage() does not use msg.sender, the relayer can call it
 * without affecting vote validity — EdDSA signature inside the encrypted
 * message is the actual proof of voter intent.
 */

export interface RelayPublishParams {
  pollAddress: `0x${string}`;
  encMessage: bigint[];
  encPubKeyX: bigint;
  encPubKeyY: bigint;
}

class RelayError extends Error {
  status?: number;
  retryAfter?: number;
  constructor(message: string, status?: number, retryAfter?: number) {
    super(message);
    this.name = 'RelayError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * POST encrypted vote payload to the relayer server.
 * Retries up to maxRetries times with retryDelay ms between attempts.
 * Throws RelayError on unrecoverable failures (e.g. 400 bad request).
 */
export async function relayPublishMessage(
  params: RelayPublishParams,
  relayerUrl: string,
  maxRetries = 3,
  retryDelay = 500,
): Promise<`0x${string}`> {
  const url = `${relayerUrl}/api/relay/publish-message`;
  const body = JSON.stringify({
    pollAddress: params.pollAddress,
    encMessage: params.encMessage.map(v => '0x' + v.toString(16)),
    encPubKeyX: '0x' + params.encPubKeyX.toString(16),
    encPubKeyY: '0x' + params.encPubKeyY.toString(16),
  });

  let attempt = 0;
  while (true) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (networkErr) {
      if (attempt < maxRetries) {
        attempt++;
        await sleep(retryDelay);
        continue;
      }
      throw new RelayError(
        `Relay network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
      );
    }

    if (res.ok) {
      const json = await res.json() as { txHash: unknown };
      const txHash = json.txHash;
      // Validate txHash is a well-formed Ethereum transaction hash before using it
      if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        throw new RelayError('Relay returned invalid txHash');
      }
      return txHash as `0x${string}`;
    }

    if (res.status === 429) {
      const json = await res.json().catch(() => ({})) as { retryAfter?: number };
      const wait = (json.retryAfter ?? 30) * 1000;
      if (attempt < maxRetries) {
        attempt++;
        await sleep(wait);
        continue;
      }
      throw new RelayError('Relay rate limited', 429, json.retryAfter);
    }

    // 5xx: transient server error — retry
    if (res.status >= 500 && attempt < maxRetries) {
      attempt++;
      await sleep(retryDelay);
      continue;
    }

    // 4xx (except 429): unrecoverable
    const errJson = await res.json().catch(() => ({})) as { error?: string };
    throw new RelayError(
      `Relay failed (${res.status}): ${errJson.error ?? res.statusText}`,
      res.status,
    );
  }
}
