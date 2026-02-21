import type { GetLogsParameters, PublicClient } from 'viem';

type GetLogsParams = Omit<GetLogsParameters, 'fromBlock' | 'toBlock'>;

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
        ...params,
        fromBlock: start,
        toBlock: batchEnd,
      });
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
