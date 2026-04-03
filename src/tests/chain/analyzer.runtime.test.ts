import {
  id,
  type JsonRpcProvider,
  type Log,
  type TransactionReceipt,
  type TransactionResponse,
} from 'ethers';
import { describe, expect, it, vi } from 'vitest';

import { getMevAnalysis } from '@/chain/analyzer/mev';
import { tryGetRevertReason } from '@/chain/analyzer/revert';
import { getTraceAnalysis } from '@/chain/analyzer/trace';
import type { MevSignal } from '@/chain/analyzer/types';

const makeProvider = () =>
  ({
    send: vi.fn(),
    call: vi.fn(),
  }) as unknown as JsonRpcProvider;

const makeTx = (overrides?: Partial<TransactionResponse>) =>
  ({
    hash: '0x' + 'a'.repeat(64),
    from: '0x00000000000000000000000000000000000000a1',
    to: '0x00000000000000000000000000000000000000ff',
    gasPrice: 20n,
    maxPriorityFeePerGas: null,
    data: '0x1234',
    value: 0n,
    ...overrides,
  }) as unknown as TransactionResponse;

const makeReceipt = (overrides?: Partial<TransactionReceipt>) =>
  ({
    blockNumber: 123,
    status: 1,
    logs: [],
    ...overrides,
  }) as unknown as TransactionReceipt;

describe('analyzer mev runtime', () => {
  it('returns disabled status when mev analysis is turned off', async () => {
    const provider = makeProvider();
    const tx = makeTx();
    const receipt = makeReceipt();

    const result = await getMevAnalysis(provider, tx, receipt, false);

    expect(result.enabled).toBe(false);
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/disabled/i);
  });

  it('returns unavailable status for pending transactions', async () => {
    const provider = makeProvider();
    const tx = makeTx();

    const result = await getMevAnalysis(provider, tx, null, true);

    expect(result.enabled).toBe(true);
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/pending/i);
  });

  it('detects likely frontrun when previous tx has same target and higher gas', async () => {
    const provider = makeProvider();
    const tx = makeTx({
      hash: '0x' + 'b'.repeat(64),
      from: '0x0000000000000000000000000000000000000002',
      to: '0x00000000000000000000000000000000000000ff',
      gasPrice: 20n,
    });
    const receipt = makeReceipt();

    (provider.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      transactions: [
        {
          hash: '0x' + 'c'.repeat(64),
          from: '0x0000000000000000000000000000000000000003',
          to: '0x00000000000000000000000000000000000000ff',
          gasPrice: '0x32',
        },
        {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          gasPrice: '0x14',
        },
        {
          hash: '0x' + 'd'.repeat(64),
          from: '0x0000000000000000000000000000000000000004',
          to: '0x0000000000000000000000000000000000000011',
          gasPrice: '0x10',
        },
      ],
    });

    const result = await getMevAnalysis(provider, tx, receipt, true);

    expect(result.available).toBe(true);
    expect(result.likelyFrontrun).toBe(true);
    expect(result.likelySandwich).toBe(false);
    expect(result.score).toBe(45);
    expect(result.signals?.some((s: MevSignal) => s.kind === 'frontrun')).toBe(
      true,
    );
  });

  it('detects likely sandwich around swaps with transfer logs', async () => {
    const provider = makeProvider();
    const tx = makeTx({
      hash: '0x' + 'e'.repeat(64),
      from: '0x000000000000000000000000000000000000000a',
      to: '0x00000000000000000000000000000000000000bb',
    });

    const transferLog = {
      address: '0x00000000000000000000000000000000000000cc',
      topics: [id('Transfer(address,address,uint256)')],
    } as unknown as Log;

    const receipt = makeReceipt({ logs: [transferLog] as unknown as Log[] });

    (provider.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      transactions: [
        {
          hash: '0x' + '1'.repeat(64),
          from: '0x00000000000000000000000000000000000000f1',
          to: tx.to,
          gasPrice: '0x10',
        },
        {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          gasPrice: '0x14',
        },
        {
          hash: '0x' + '2'.repeat(64),
          from: '0x00000000000000000000000000000000000000f1',
          to: tx.to,
          gasPrice: '0x10',
        },
      ],
    });

    const result = await getMevAnalysis(provider, tx, receipt, true);

    expect(result.available).toBe(true);
    expect(result.likelySandwich).toBe(true);
    expect(result.score).toBe(65);
    expect(result.signals?.some((s: MevSignal) => s.kind === 'sandwich')).toBe(
      true,
    );
  });

  it('returns unavailable with error details when rpc block query fails', async () => {
    const provider = makeProvider();
    const tx = makeTx();
    const receipt = makeReceipt();
    (provider.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('rpc unavailable'),
    );

    const result = await getMevAnalysis(provider, tx, receipt, true);

    expect(result.enabled).toBe(true);
    expect(result.available).toBe(false);
    expect(result.error).toContain('rpc unavailable');
  });
});

describe('analyzer trace runtime', () => {
  it('returns disabled state when trace flag is false', async () => {
    const provider = makeProvider();

    const result = await getTraceAnalysis(
      provider,
      '0x' + 'a'.repeat(64),
      false,
    );

    expect(result.enabled).toBe(false);
    expect(result.available).toBe(false);
  });

  it('flattens nested call tracer output and counts failures/depth', async () => {
    const provider = makeProvider();
    (provider.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      type: 'CALL',
      from: '0x00000000000000000000000000000000000000a1',
      to: '0x00000000000000000000000000000000000000b2',
      value: '0x0',
      calls: [
        {
          type: 'DELEGATECALL',
          from: '0x00000000000000000000000000000000000000b2',
          to: '0x00000000000000000000000000000000000000c3',
          value: '0x0',
          calls: [
            {
              type: 'CALL',
              from: '0x00000000000000000000000000000000000000c3',
              to: '0x00000000000000000000000000000000000000d4',
              value: '0x0',
              error: 'execution reverted',
            },
          ],
        },
      ],
    });

    const result = await getTraceAnalysis(
      provider,
      '0x' + 'a'.repeat(64),
      true,
    );

    expect(result.enabled).toBe(true);
    expect(result.available).toBe(true);
    expect(result.totalCalls).toBe(3);
    expect(result.failedCalls).toBe(1);
    expect(result.maxDepth).toBe(2);
    expect(result.calls?.[0].depth).toBe(0);
    expect(result.calls?.[1].depth).toBe(1);
    expect(result.calls?.[2].depth).toBe(2);
    expect(result.calls?.[0].from).toBe(
      '0x00000000000000000000000000000000000000A1',
    );
  });

  it('returns unavailable state when debug trace api errors', async () => {
    const provider = makeProvider();
    (provider.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('method not found'),
    );

    const result = await getTraceAnalysis(
      provider,
      '0x' + 'b'.repeat(64),
      true,
    );

    expect(result.enabled).toBe(true);
    expect(result.available).toBe(false);
    expect(result.error).toContain('method not found');
  });
});

describe('analyzer revert runtime', () => {
  it('returns null for successful receipt without calling provider', async () => {
    const provider = makeProvider();
    const tx = makeTx();
    const receipt = makeReceipt({ status: 1 });

    const reason = await tryGetRevertReason(provider, tx, receipt);

    expect(reason).toBeNull();
    expect((provider.call as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      0,
    );
  });

  it('returns null for invalid block numbers', async () => {
    const provider = makeProvider();
    const tx = makeTx();
    const receipt = makeReceipt({ status: 0, blockNumber: 0 });

    const reason = await tryGetRevertReason(provider, tx, receipt);

    expect(reason).toBeNull();
    expect((provider.call as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      0,
    );
  });

  it('returns revert message when eth_call simulation throws', async () => {
    const provider = makeProvider();
    const tx = makeTx();
    const receipt = makeReceipt({ status: 0, blockNumber: 123 });
    (provider.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('execution reverted: slippage too high'),
    );

    const reason = await tryGetRevertReason(provider, tx, receipt);

    expect(reason).toContain('slippage too high');
    expect((provider.call as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      1,
    );
  });
});
