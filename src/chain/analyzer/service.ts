import {
  formatEther,
  formatUnits,
  JsonRpcProvider,
  TransactionReceipt as EthersTransactionReceipt,
  TransactionResponse as EthersTransactionResponse,
} from 'ethers';

import { decodeFunction } from './decode.js';
import { parsePoolEvents } from './events.js';
import { getMevAnalysis } from './mev.js';
import { tryGetRevertReason } from './revert.js';
import { getTraceAnalysis } from './trace.js';
import { parseTransfers } from './transfers.js';
import type { AnalyzerResult, TokenInfo } from './types.js';

type AnalyzeRuntimeOptions = {
  trace: boolean;
  mev: boolean;
};

function buildGasSummary(
  tx: EthersTransactionResponse,
  receipt: EthersTransactionReceipt | null,
): AnalyzerResult['gas'] {
  if (!receipt) {
    return {
      limit: tx.gasLimit.toString(),
      used: 'PENDING',
    };
  }

  return {
    limit: tx.gasLimit.toString(),
    used: receipt.gasUsed.toString(),
    usagePercent: (
      Number((receipt.gasUsed * 10000n) / tx.gasLimit) / 100
    ).toFixed(2),
    effectivePriceGwei: formatUnits(receipt.gasPrice, 'gwei'),
    transactionFeeEth: formatEther(receipt.gasUsed * receipt.gasPrice),
  };
}

export async function analyzeTransaction(
  provider: JsonRpcProvider,
  txHash: string,
  options: AnalyzeRuntimeOptions,
): Promise<AnalyzerResult> {
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new Error(`Transaction not found: ${txHash}`);
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  const block = receipt ? await provider.getBlock(receipt.blockNumber) : null;

  const decoded = decodeFunction(tx.data, tx.value);
  const tokenCache = new Map<string, TokenInfo>();
  const transfers = receipt
    ? await parseTransfers(provider, receipt.logs, tokenCache)
    : [];
  const pairEvents = receipt ? parsePoolEvents(receipt.logs) : [];
  const failureReason =
    receipt && receipt.status === 0
      ? (await tryGetRevertReason(provider, tx, receipt)) ||
        'Unavailable from RPC node'
      : undefined;

  const trace = await getTraceAnalysis(provider, txHash, options.trace);
  const mev = await getMevAnalysis(provider, tx, receipt, options.mev);

  return {
    hash: txHash,
    block: receipt?.blockNumber ?? 'PENDING',
    timestamp: block
      ? new Date(Number(block.timestamp) * 1000).toISOString()
      : 'N/A',
    status: receipt ? (receipt.status === 1 ? 'SUCCESS' : 'FAILED') : 'PENDING',
    from: tx.from,
    to: tx.to || 'Contract Creation',
    valueEth: formatEther(tx.value),
    gas: buildGasSummary(tx, receipt),
    functionCall: {
      selector: decoded.selector,
      protocol: decoded.protocol || 'Unknown',
      signature: decoded.signature || 'Unknown',
      args: decoded.args || [],
    },
    transfers,
    poolEvents: pairEvents,
    failureReason,
    trace,
    mev,
  };
}
