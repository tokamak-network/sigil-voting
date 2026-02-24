import type { AbiEvent, GetLogsParameters, PublicClient } from 'viem';

type GetLogsParams = {
  address?: `0x${string}` | `0x${string}`[];
  event?: AbiEvent;
  args?: Record<string, unknown>;
};

export async function getLogsChunked(
  publicClient: PublicClient,
  params: GetLogsParams,
  fromBlock: bigint,
  toBlock: bigint | 'latest',
  initialChunkSize: bigint = 50_000n,
) {
  const endBlock = toBlock === 'latest' ? await publicClient.getBlockNumber() : toBlock;
  const logs: Awaited<ReturnType<PublicClient['getLogs']>> = [];

  let start = fromBlock;
  let chunkSize = initialChunkSize;

  while (start <= endBlock) {
    const tentativeEnd = start + chunkSize - 1n;
    const batchEnd = tentativeEnd > endBlock ? endBlock : tentativeEnd;

    try {
      const batch = await publicClient.getLogs({
        ...(params as GetLogsParameters),
        fromBlock: start,
        toBlock: batchEnd,
      } as GetLogsParameters);
      logs.push(...batch);
      start = batchEnd + 1n;
      chunkSize = initialChunkSize;
    } catch (err) {
      if (chunkSize <= 2000n) {
        throw err;
      }
      chunkSize = chunkSize / 2n;
    }
  }

  return logs;
}
