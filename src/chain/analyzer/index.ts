import { runCli } from './cli.js';

const isDirectExecution = /chain[\\/]+analyzer([\\/]+index)?(\.(ts|js))?$/.test(
  process.argv[1] ?? '',
);

if (isDirectExecution) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}

export { parseArgs } from './args.js';
export { decodeFunction } from './decode.js';
export { analyzeTransaction } from './service.js';
export { runCli } from './cli.js';
export type {
  AnalyzerOptions,
  AnalyzerResult,
  DecodeFunctionResult,
  MevAnalysis,
  MevSignal,
  OutputFormat,
  TokenInfo,
  TraceAnalysis,
  TraceCall,
} from './types.js';
