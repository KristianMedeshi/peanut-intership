import { runCli } from './cli';

const ANALYZER_USAGE =
  'Usage: tsx src/chain/analyzer/entry.ts <tx_hash> [--rpc URL] [--format text|json] [--no-trace] [--no-mev]';

function validateCliArgs(argv: string[]): void {
  if (argv.length === 0) {
    throw new Error(ANALYZER_USAGE);
  }

  const txHash = argv[0];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--rpc') {
      i++;
      continue;
    }

    if (arg === '--format' || arg === '-format') {
      const raw = (argv[i + 1] || '').toLowerCase();
      if (raw !== 'text' && raw !== 'json') {
        throw new Error('Invalid format. Expected text or json.');
      }
      i++;
      continue;
    }

    if (arg === '--no-trace' || arg === '--no-mev') {
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error(
      'Invalid transaction hash. Must be a 0x-prefixed 32-byte hash.',
    );
  }
}

export async function runAnalyzerEntrypoint(argv: string[]): Promise<void> {
  validateCliArgs(argv);

  await runCli(argv);
}

const isDirectExecution = /chain[\\/]+analyzer([\\/]+entry)?(\.(ts|js))?$/.test(
  process.argv[1] ?? '',
);

if (isDirectExecution) {
  runAnalyzerEntrypoint(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}
