import { ANALYZER_USAGE, DEFAULT_RPC } from './constants.js';
import type { AnalyzerOptions, OutputFormat } from './types.js';

export function parseArgs(argv: string[]): AnalyzerOptions {
  if (argv.length === 0) {
    throw new Error(ANALYZER_USAGE);
  }

  const txHash = argv[0];
  let rpcUrl = DEFAULT_RPC;
  let format: OutputFormat = 'text';
  let trace = true;
  let mev = true;

  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--rpc') {
      rpcUrl = argv[i + 1] || rpcUrl;
      i++;
      continue;
    }

    if (argv[i] === '--format' || argv[i] === '-format') {
      const raw = (argv[i + 1] || '').toLowerCase();
      if (raw !== 'text' && raw !== 'json') {
        throw new Error('Invalid format. Expected text or json.');
      }
      format = raw;
      i++;
      continue;
    }

    if (argv[i] === '--no-trace') {
      trace = false;
      continue;
    }

    if (argv[i] === '--no-mev') {
      mev = false;
      continue;
    }

    throw new Error(`Unknown argument: ${argv[i]}`);
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    throw new Error(
      'Invalid transaction hash. Must be a 0x-prefixed 32-byte hash.',
    );
  }

  return { txHash, rpcUrl, format, trace, mev };
}
