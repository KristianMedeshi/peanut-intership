import { describe, expect, it, vi } from 'vitest';

import { ChainClient, GasPrice } from '@/chain/client';
import {
  InsufficientFunds,
  NonceTooLow,
  ReplacementUnderpriced,
  RPCError,
  TransactionFailed,
} from '@/chain/errors';
import { Address, CoreTransactionRequest, TokenAmount } from '@/core/types';

type ProviderMock = {
  getBalance: ReturnType<typeof vi.fn>;
  getTransactionCount: ReturnType<typeof vi.fn>;
  getBlock: ReturnType<typeof vi.fn>;
  getFeeData: ReturnType<typeof vi.fn>;
  estimateGas: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  getTransaction: ReturnType<typeof vi.fn>;
  getTransactionReceipt: ReturnType<typeof vi.fn>;
  call: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

const makeProvider = (): ProviderMock => ({
  getBalance: vi.fn(),
  getTransactionCount: vi.fn(),
  getBlock: vi.fn(),
  getFeeData: vi.fn(),
  estimateGas: vi.fn(),
  send: vi.fn(),
  getTransaction: vi.fn(),
  getTransactionReceipt: vi.fn(),
  call: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
});

const setupClient = (
  providers: ProviderMock[],
  maxRetries: number = 3,
): ChainClient => {
  const urls = providers.map((_, i) => `http://rpc-${i}`);
  const client = new ChainClient(urls, 30, maxRetries);
  (client as unknown as { providers: ProviderMock[] }).providers = providers;
  (client as unknown as { providerUrls: string[] }).providerUrls = urls;
  (client as unknown as { nextIndex: number }).nextIndex = 0;
  return client;
};

const setupClientWs = (
  providers: ProviderMock[],
  maxRetries: number = 3,
): ChainClient => {
  const urls = providers.map((_, i) =>
    i === 0 ? `ws://rpc-${i}` : `http://rpc-${i}`,
  );
  const client = new ChainClient(urls, 30, maxRetries);
  (client as unknown as { providers: ProviderMock[] }).providers = providers;
  (client as unknown as { providerUrls: string[] }).providerUrls = urls;
  (client as unknown as { nextIndex: number }).nextIndex = 0;
  return client;
};

describe('GasPrice', () => {
  it('computes max fee using priority tier and buffer', () => {
    const gas = new GasPrice(
      30_000_000_000n,
      1_000_000_000n,
      2_000_000_000n,
      3_000_000_000n,
    );

    expect(gas.getMaxFee('low', 1.2)).toBe(37_000_000_000n);
    expect(gas.getMaxFee('medium', 1.2)).toBe(38_000_000_000n);
    expect(gas.getMaxFee('high', 1.2)).toBe(39_000_000_000n);
  });
});

describe('ChainClient', () => {
  it('throws when initialized with no rpc urls', () => {
    expect(() => new ChainClient([])).toThrow(/at least one provider url/i);
  });

  it('retries and falls back to next endpoint', async () => {
    const first = makeProvider();
    const second = makeProvider();

    first.getTransaction.mockRejectedValueOnce(
      new Error('temporary rpc error'),
    );
    second.getTransaction.mockResolvedValueOnce({ hash: '0xabc' });

    const client = setupClient([first, second], 2);

    const tx = await client.getTransaction('0xhash');
    expect(tx).toEqual({ hash: '0xabc' });
    expect(first.getTransaction).toHaveBeenCalledTimes(1);
    expect(second.getTransaction).toHaveBeenCalledTimes(1);
  });

  it('classifies insufficient funds rpc errors', async () => {
    const provider = makeProvider();
    provider.getTransaction.mockRejectedValueOnce(
      new Error('insufficient funds for gas * price + value'),
    );

    const client = setupClient([provider], 1);

    await expect(client.getTransaction('0xhash')).rejects.toBeInstanceOf(
      InsufficientFunds,
    );
  });

  it('classifies nonce too low rpc errors', async () => {
    const provider = makeProvider();
    provider.getTransaction.mockRejectedValueOnce(new Error('nonce too low'));

    const client = setupClient([provider], 1);

    await expect(client.getTransaction('0xhash')).rejects.toBeInstanceOf(
      NonceTooLow,
    );
  });

  it('classifies replacement underpriced errors', async () => {
    const provider = makeProvider();
    provider.getTransaction.mockRejectedValueOnce(
      new Error('replacement transaction underpriced'),
    );

    const client = setupClient([provider], 1);

    await expect(client.getTransaction('0xhash')).rejects.toBeInstanceOf(
      ReplacementUnderpriced,
    );
  });

  it('returns balance as ETH TokenAmount', async () => {
    const provider = makeProvider();
    provider.getBalance.mockResolvedValueOnce(123n);

    const client = setupClient([provider]);
    const address = new Address('0x0000000000000000000000000000000000000001');

    const balance = await client.getBalance(address);
    expect(balance.raw).toBe(123n);
    expect(balance.decimals).toBe(18);
    expect(balance.symbol).toBe('ETH');
  });

  it('sends byte transactions as hex to eth_sendRawTransaction', async () => {
    const provider = makeProvider();
    provider.send.mockResolvedValueOnce('0xtxhash');

    const client = setupClient([provider]);

    const hash = await client.sendTransaction(Uint8Array.from([1, 2, 3]));
    expect(hash).toBe('0xtxhash');
    expect(provider.send).toHaveBeenCalledWith('eth_sendRawTransaction', [
      '0x010203',
    ]);
  });

  it('maps fee data and base fee in getGasPrice', async () => {
    const provider = makeProvider();
    provider.getBlock.mockResolvedValueOnce({ baseFeePerGas: 20_000_000_000n });
    provider.getFeeData.mockResolvedValueOnce({
      maxPriorityFeePerGas: 2_000_000_000n,
    });

    const client = setupClient([provider]);

    const gas = await client.getGasPrice();
    expect(gas.baseFee).toBe(20_000_000_000n);
    expect(gas.priorityFeeLow).toBe(1_000_000_000n);
    expect(gas.priorityFeeMedium).toBe(2_000_000_000n);
    expect(gas.priorityFeeHigh).toBe(3_000_000_000n);
  });

  it('throws TransactionFailed when receipt status is reverted', async () => {
    const provider = makeProvider();
    provider.getTransactionReceipt.mockResolvedValueOnce({
      hash: '0xdead',
      blockNumber: 10,
      status: 0,
      gasUsed: 21_000n,
      gasPrice: 2_000_000_000n,
      logs: [],
    });

    const client = setupClient([provider]);

    await expect(
      client.waitForReceipt('0xdead', 1, 0.01),
    ).rejects.toBeInstanceOf(TransactionFailed);
  });

  it('times out waitForReceipt when never mined', async () => {
    const provider = makeProvider();
    provider.getTransactionReceipt.mockResolvedValue(null);

    const client = setupClient([provider]);

    await expect(
      client.waitForReceipt('0xtimeout', 0.05, 0.01),
    ).rejects.toBeInstanceOf(RPCError);
  });

  it('estimates gas from CoreTransactionRequest', async () => {
    const provider = makeProvider();
    provider.estimateGas.mockResolvedValueOnce(25000n);

    const client = setupClient([provider]);

    const tx = new CoreTransactionRequest({
      to: new Address('0x0000000000000000000000000000000000000001'),
      value: new TokenAmount(1n, 18, 'ETH'),
      data: '0x',
    });

    const gas = await client.estimateGas(tx);
    expect(gas).toBe(25000n);
  });

  it('throws in monitorPendingTransactions if no websocket provided', async () => {
    const provider = makeProvider();
    const client = setupClient([provider]);
    await expect(
      client.monitorPendingTransactions(vi.fn()),
    ).rejects.toBeInstanceOf(RPCError);
  });

  it('sets up monitorPendingTransactions safely if websocket provided', async () => {
    const provider = makeProvider();
    const client = setupClientWs([provider]);

    const callback = vi.fn();
    const unsubscribe = await client.monitorPendingTransactions(callback);

    expect(provider.on).toHaveBeenCalledWith('pending', callback);

    unsubscribe();
    expect(provider.off).toHaveBeenCalledWith('pending', callback);
  });
});
