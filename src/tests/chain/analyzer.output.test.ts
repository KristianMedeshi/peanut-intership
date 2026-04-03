import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { printText } from '@/chain/analyzer/output';
import type { AnalyzerResult } from '@/chain/analyzer/types';

describe('analyzer output printing', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('prints summary and handles disabled trace/mev and empty transfers/pool events', () => {
    const result: AnalyzerResult = {
      hash: '0x' + 'a'.repeat(64),
      block: 'PENDING',
      timestamp: 'N/A',
      status: 'PENDING',
      from: '0x' + '1'.repeat(40),
      to: '0x' + '2'.repeat(40),
      valueEth: '0.0',
      gas: { limit: '21000', used: 'PENDING' },
      functionCall: {
        selector: '0x',
        protocol: 'Unknown',
        signature: 'Unknown',
        args: [],
      },
      transfers: [],
      poolEvents: [],
      trace: { enabled: false, available: false },
      mev: { enabled: false, available: false },
    };

    printText(result);

    expect(spy).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('Transaction Analysis');
    // Transfers and pool events should report none
    expect(spy).toHaveBeenCalledWith('None detected');
    // Trace and MEV are disabled
    expect(spy).toHaveBeenCalledWith('Disabled');
  });

  it('prints MEV signals and related details when available', () => {
    const result: AnalyzerResult = {
      hash: '0x' + 'b'.repeat(64),
      block: 123,
      timestamp: '2024-01-01T00:00:00.000Z',
      status: 'SUCCESS',
      from: '0x' + '1'.repeat(40),
      to: '0x' + '2'.repeat(40),
      valueEth: '0.5',
      gas: {
        limit: '210000',
        used: '100000',
        usagePercent: '48.00',
        effectivePriceGwei: '20',
        transactionFeeEth: '0.002',
      },
      functionCall: {
        selector: '0xdeadbeef',
        protocol: 'Uniswap V2 Router',
        signature:
          'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        args: ['amountIn: 1000'],
      },
      transfers: ['TKN: 0x1 -> 0x2 100'],
      poolEvents: ['Pool sync'],
      trace: { enabled: true, available: false, error: 'trace not available' },
      mev: {
        enabled: true,
        available: true,
        score: 80,
        likelyFrontrun: true,
        likelySandwich: false,
        signals: [
          { level: 'high', kind: 'frontrun', detail: 'suspicious activity' },
        ],
      },
    };

    printText(result);

    expect(spy).toHaveBeenCalledWith('MEV Detection');
    expect(spy).toHaveBeenCalledWith('Signals:');

    const allLogs = spy.mock.calls.flat();
    const found = allLogs.some((v: unknown) =>
      String(v).includes('suspicious activity'),
    );
    expect(found).toBe(true);
  });
});
