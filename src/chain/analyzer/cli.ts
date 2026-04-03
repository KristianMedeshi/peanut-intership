import { JsonRpcProvider } from 'ethers';

import { parseArgs } from './args.js';
import { printText } from './output.js';
import { analyzeTransaction } from './service.js';

export async function runCli(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const { txHash, rpcUrl, format, trace, mev } = parseArgs(argv);
  const provider = new JsonRpcProvider(rpcUrl);
  const result = await analyzeTransaction(provider, txHash, { trace, mev });

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printText(result);
}
