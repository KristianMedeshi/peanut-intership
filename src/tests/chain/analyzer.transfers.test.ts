/* eslint-disable @typescript-eslint/no-explicit-any */
import { Interface } from 'ethers';
import { describe, it, expect } from 'vitest';

import { ERC20_ABI } from '@/chain/analyzer/constants';
import { parseTransfers } from '@/chain/analyzer/transfers';

describe('parseTransfers', () => {
  it('parses ERC20 Transfer logs using provided token cache', async () => {
    const iface = new Interface(ERC20_ABI);
    const transferEvent = iface.getEvent('Transfer');

    const tokenAddress = '0x' + '5'.repeat(40);
    const from = '0x' + '1'.repeat(40);
    const to = '0x' + '2'.repeat(40);
    const value = 1000000000000000000n; // 1.0 with 18 decimals

    const encoded = iface.encodeEventLog(transferEvent!, [from, to, value]);

    const tokenCache = new Map<string, { symbol: string; decimals: number }>([
      [tokenAddress.toLowerCase(), { symbol: 'TKN', decimals: 18 }],
    ]);

    // provider is not used when cache is populated
    const provider = {} as any;

    const lines = await parseTransfers(
      provider,
      [
        {
          address: tokenAddress,
          topics: encoded.topics,
          data: encoded.data,
        } as any,
      ],
      tokenCache,
    );

    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('TKN:');
    expect(lines[0]).toContain('->');
    // should include human amount '1.0' or '1'
    expect(/1(?:\.0+)?/.test(lines[0])).toBe(true);
  });
});
