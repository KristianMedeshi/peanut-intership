import { describe, expect, it, vi } from 'vitest';

import { TransactionBuilder } from '@/chain/builder';
import { GasPrice } from '@/chain/client';
import { ChainError } from '@/chain/errors';
import { Address, TokenAmount } from '@/core/types';

const recipient = new Address('0x0000000000000000000000000000000000000001');
const value = TokenAmount.fromHuman('0.1', 18, 'ETH');

const makeClient = () => ({
  getNonce: vi.fn().mockResolvedValue(7),
  getGasPrice: vi
    .fn()
    .mockResolvedValue(
      new GasPrice(
        20_000_000_000n,
        1_000_000_000n,
        2_000_000_000n,
        3_000_000_000n,
      ),
    ),
  estimateGas: vi.fn().mockResolvedValue(21_000n),
  sendTransaction: vi.fn().mockResolvedValue('0xabc'),
  waitForReceipt: vi.fn().mockResolvedValue({ txHash: '0xabc', status: true }),
});

const makeWallet = () => ({
  address: '0x0000000000000000000000000000000000000002',
  signTransaction: vi.fn().mockResolvedValue({
    transactionHash: '0xhash',
    rawTransaction: '0xraw',
    v: 27,
    r: '0x' + '1'.repeat(64),
    s: '0x' + '2'.repeat(64),
  }),
});

describe('TransactionBuilder', () => {
  it('requires recipient and value before build', async () => {
    const builder = new TransactionBuilder(
      makeClient() as never,
      makeWallet() as never,
    );

    await expect(builder.build()).rejects.toBeInstanceOf(ChainError);
  });

  it('validates nonce, gas limit, chain id, and gas estimate buffer', () => {
    const builder = new TransactionBuilder(
      makeClient() as never,
      makeWallet() as never,
    );

    expect(() => builder.nonce(-1)).toThrow(/nonce/i);
    expect(() => builder.gasLimit(0n)).toThrow(/gas limit/i);
    expect(() => builder.chainId(0)).toThrow(/chain id/i);
    expect(() => builder.withGasEstimate(1)).toThrow(/buffer/i);
  });

  it('builds using client nonce, gas price, and gas estimate', async () => {
    const client = makeClient();
    const wallet = makeWallet();

    const tx = await new TransactionBuilder(client as never, wallet as never)
      .to(recipient)
      .value(value)
      .withGasPrice('high')
      .withGasEstimate(1.2)
      .build();

    expect(client.getNonce).toHaveBeenCalledTimes(1);
    expect(client.getGasPrice).toHaveBeenCalledTimes(1);
    expect(client.estimateGas).toHaveBeenCalledTimes(1);
    expect(tx.nonce).toBe(7);
    expect(tx.gasLimit).toBe(25200n);
    expect(tx.maxPriorityFee).toBe(3_000_000_000n);
  });

  it('buildAndSign signs built web3 tx', async () => {
    const client = makeClient();
    const wallet = makeWallet();

    const signed = await new TransactionBuilder(
      client as never,
      wallet as never,
    )
      .to(recipient)
      .value(value)
      .buildAndSign();

    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    expect(signed.rawTransaction).toBe('0xraw');
  });

  it('send sends signed transaction', async () => {
    const client = makeClient();
    const wallet = makeWallet();

    const hash = await new TransactionBuilder(client as never, wallet as never)
      .to(recipient)
      .value(value)
      .send();

    expect(client.sendTransaction).toHaveBeenCalledWith('0xraw');
    expect(hash).toBe('0xabc');
  });

  it('sendAndWait forwards timeout to client waitForReceipt', async () => {
    const client = makeClient();
    const wallet = makeWallet();

    await new TransactionBuilder(client as never, wallet as never)
      .to(recipient)
      .value(value)
      .sendAndWait(45);

    expect(client.waitForReceipt).toHaveBeenCalledWith('0xabc', 45);
  });
});
