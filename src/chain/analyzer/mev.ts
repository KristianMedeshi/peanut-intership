import {
  id,
  JsonRpcProvider,
  Log,
  TransactionReceipt as EthersTransactionReceipt,
  TransactionResponse as EthersTransactionResponse,
} from 'ethers';

import type { MevAnalysis, MevSignal } from './types.js';

function hexToBigInt(hexValue: string | null | undefined): bigint {
  if (!hexValue || hexValue === '0x') {
    return 0n;
  }

  return BigInt(hexValue);
}

function extractLikelyTokenSet(logs: readonly Log[]): Set<string> {
  const tokens = new Set<string>();

  for (const log of logs) {
    if (log.topics[0] === id('Transfer(address,address,uint256)')) {
      tokens.add(log.address.toLowerCase());
    }
  }

  return tokens;
}

export async function getMevAnalysis(
  provider: JsonRpcProvider,
  tx: EthersTransactionResponse,
  receipt: EthersTransactionReceipt | null,
  enabled: boolean,
): Promise<MevAnalysis> {
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      error: 'MEV detection disabled by flag.',
    };
  }

  if (!receipt) {
    return {
      enabled: true,
      available: false,
      error: 'Pending transaction has no block context for MEV analysis.',
    };
  }

  try {
    const hexBlock = `0x${receipt.blockNumber.toString(16)}`;
    const rawBlock = (await provider.send('eth_getBlockByNumber', [
      hexBlock,
      true,
    ])) as {
      transactions?: Array<{
        hash: string;
        from: string;
        to: string | null;
        gasPrice?: string;
        maxPriorityFeePerGas?: string;
      }>;
    };

    const txs = rawBlock.transactions || [];
    const currentHash = tx.hash.toLowerCase();
    const index = txs.findIndex(
      (item) => item.hash?.toLowerCase() === currentHash,
    );

    if (index <= 0 || index >= txs.length - 1) {
      return {
        enabled: true,
        available: true,
        score: 0,
        likelyFrontrun: false,
        likelySandwich: false,
        signals: [],
      };
    }

    const prev = txs[index - 1];
    const next = txs[index + 1];
    const currentTo = (tx.to || '').toLowerCase();
    const prevTo = (prev.to || '').toLowerCase();
    const nextTo = (next.to || '').toLowerCase();
    const transferTokens = extractLikelyTokenSet(receipt.logs);

    const signals: MevSignal[] = [];
    let score = 0;

    const prevGas = hexToBigInt(prev.gasPrice || prev.maxPriorityFeePerGas);
    const currentGas = tx.gasPrice || tx.maxPriorityFeePerGas || 0n;

    if (
      prevTo &&
      currentTo &&
      prevTo === currentTo &&
      prev.from.toLowerCase() !== tx.from.toLowerCase() &&
      prevGas > currentGas
    ) {
      score += 45;
      signals.push({
        level: 'medium',
        kind: 'frontrun',
        detail:
          'Previous transaction targets same contract from a different sender with higher gas bid.',
      });
    }

    const sameBundler =
      prev.from.toLowerCase() === next.from.toLowerCase() &&
      prev.from.toLowerCase() !== tx.from.toLowerCase();
    const sameTarget =
      currentTo && prevTo === currentTo && nextTo === currentTo;

    if (sameBundler && sameTarget && transferTokens.size > 0) {
      score += 65;
      signals.push({
        level: 'high',
        kind: 'sandwich',
        detail:
          'Adjacent transactions by same external account around target on same contract suggest sandwich pattern.',
      });
    }

    score = Math.min(100, score);

    return {
      enabled: true,
      available: true,
      score,
      likelyFrontrun: signals.some((signal) => signal.kind === 'frontrun'),
      likelySandwich: signals.some((signal) => signal.kind === 'sandwich'),
      signals,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      enabled: true,
      available: false,
      error: message,
    };
  }
}
