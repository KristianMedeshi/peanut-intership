/* eslint-disable @typescript-eslint/no-explicit-any */
import { Interface } from 'ethers';
import { describe, it, expect } from 'vitest';

import {
  PAIR_EVENTS_ABI,
  UNISWAP_V3_POOL_EVENTS_ABI,
} from '@/chain/analyzer/constants';
import { parsePoolEvents } from '@/chain/analyzer/events';

describe('parsePoolEvents', () => {
  it('parses Uniswap V2 Swap and Sync events', () => {
    const iface = new Interface(PAIR_EVENTS_ABI);

    const swapEvent = iface.getEvent('Swap');
    const syncEvent = iface.getEvent('Sync');

    const swapLog = iface.encodeEventLog(swapEvent!, [
      '0x00000000000000000000000000000000000000aa',
      1n,
      0n,
      0n,
      1n,
      '0x00000000000000000000000000000000000000bb',
    ]);

    const syncLog = iface.encodeEventLog(syncEvent!, [100n, 200n]);

    const parsed = parsePoolEvents([
      { address: '0xPool', topics: swapLog.topics, data: swapLog.data } as any,
      { address: '0xPool', topics: syncLog.topics, data: syncLog.data } as any,
    ]);

    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed.some((l) => l.startsWith('V2 Swap:'))).toBe(true);
    expect(parsed.some((l) => l.startsWith('Sync:'))).toBe(true);
  });

  it('parses Uniswap V3 Swap event', () => {
    const iface = new Interface(UNISWAP_V3_POOL_EVENTS_ABI);
    const swapEvent = iface.getEvent('Swap');

    const v3Log = iface.encodeEventLog(swapEvent!, [
      '0x0000000000000000000000000000000000000011',
      '0x0000000000000000000000000000000000000022',
      -100n,
      200n,
      0n,
      0n,
      123,
    ]);

    const parsed = parsePoolEvents([
      { address: '0xPool', topics: v3Log.topics, data: v3Log.data } as any,
    ]);

    expect(parsed.some((l) => l.startsWith('V3 Swap:'))).toBe(true);
  });
});
