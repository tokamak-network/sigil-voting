/**
 * Relayer client for gasless MACI signUp.
 * Sends pubKey to relayer, which calls MACI.signUp() on behalf of the user.
 */

class RelaySignUpError extends Error {
  status?: number;
  retryAfter?: number;
  constructor(message: string, status?: number, retryAfter?: number) {
    super(message);
    this.name = 'RelaySignUpError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export interface RelaySignUpParams {
  pubKeyX: bigint;
  pubKeyY: bigint;
}

export interface RelaySignUpResult {
  txHash: `0x${string}`;
  stateIndex: number;
}

export async function relaySignUp(
  params: RelaySignUpParams,
  relayerUrl: string,
  maxRetries = 3,
  retryDelay = 1000,
): Promise<RelaySignUpResult> {
  const url = `${relayerUrl}/api/relay/sign-up`;
  const body = JSON.stringify({
    pubKeyX: '0x' + params.pubKeyX.toString(16),
    pubKeyY: '0x' + params.pubKeyY.toString(16),
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
      throw new RelaySignUpError(
        `Relay network error: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
      );
    }

    if (res.ok) {
      const json = await res.json() as { txHash: unknown; stateIndex: unknown };
      const txHash = json.txHash;
      if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        throw new RelaySignUpError('Relay returned invalid txHash');
      }
      const stateIndex = typeof json.stateIndex === 'number' ? json.stateIndex : 0;
      return { txHash: txHash as `0x${string}`, stateIndex };
    }

    if (res.status === 429) {
      const json = await res.json().catch(() => ({})) as { retryAfter?: number };
      const wait = (json.retryAfter ?? 30) * 1000;
      if (attempt < maxRetries) {
        attempt++;
        await sleep(wait);
        continue;
      }
      throw new RelaySignUpError('Relay rate limited', 429, json.retryAfter);
    }

    if (res.status >= 500 && attempt < maxRetries) {
      attempt++;
      await sleep(retryDelay);
      continue;
    }

    const errJson = await res.json().catch(() => ({})) as { error?: string };
    throw new RelaySignUpError(
      `Relay signUp failed (${res.status}): ${errJson.error ?? res.statusText}`,
      res.status,
    );
  }
}
