import 'dotenv/config';

import { ChainClient } from '@/chain';
import { requireEnv } from '@/lib';

async function main(): Promise<void> {
  const wsUrl = requireEnv(
    'WS_URL',
    'WebSocket URL is required for pending monitor integration test.',
  );

  const urls = [wsUrl];

  const durationSeconds = Number(process.env.PENDING_MONITOR_SECONDS || 15);
  const strict = process.env.PENDING_MONITOR_STRICT === 'true';

  console.log('Pending monitor integration test');
  console.log(`WS endpoint: ${wsUrl}`);
  console.log(`Duration: ${durationSeconds}s`);

  const client = new ChainClient(urls);
  const seen = new Set<string>();

  const unsubscribe = await client.monitorPendingTransactions((txHash) => {
    console.log(`  pending: ${txHash}`);
    seen.add(txHash);
  });

  try {
    await sleep(durationSeconds * 1000);
  } finally {
    unsubscribe();
  }

  console.log(`Observed pending tx hashes: ${seen.size}`);

  if (strict && seen.size === 0) {
    throw new Error(
      'Strict mode enabled and no pending transactions were observed.',
    );
  }

  console.log('Pending monitor integration test PASSED');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nPending monitor integration test FAILED: ${message}`);
    process.exitCode = 1;
  });

export {};
