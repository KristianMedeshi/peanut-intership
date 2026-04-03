import { describe, expect, it } from 'vitest';

import {
  Address,
  CoreTransactionReceipt,
  CoreTransactionRequest,
  Token,
  TokenAmount,
} from '@/core/types';

describe('Address', () => {
  it('throws a clear error for invalid addresses', () => {
    expect(() => new Address('invalid')).toThrow(/invalid ethereum address/i);
  });

  it('matches addresses case-insensitively', () => {
    const lower = new Address('0x52908400098527886e0f7030069857d2e4169ee7');
    const upper = new Address('0x52908400098527886E0F7030069857D2E4169EE7');

    expect(lower.equals(upper)).toBe(true);
    expect(lower.lower).toBe(upper.lower);
  });
});

describe('TokenAmount', () => {
  it('parses human units to raw integer amount exactly', () => {
    const amount = TokenAmount.fromHuman('1.5', 18, 'ETH');
    expect(amount.raw).toBe(1500000000000000000n);
  });

  it('rejects addition when decimals do not match', () => {
    const a = TokenAmount.fromHuman('1', 18, 'ETH');
    const b = TokenAmount.fromHuman('1', 6, 'USDC');
    expect(() => a.add(b)).toThrow(/different decimals/i);
  });

  it('uses exact integer math for multiplication', () => {
    const amount = TokenAmount.fromHuman('2.0', 18, 'ETH');
    const multiplied = amount.multiply('1.5');
    expect(multiplied.raw).toBe(3000000000000000000n);
  });

  it('rejects non-string and non-bigint multiplication factors', () => {
    const amount = TokenAmount.fromHuman('2', 18, 'ETH');
    expect(() => amount.multiply(1.5 as unknown as string)).toThrow(
      /bigint or decimal string/i,
    );
  });
});

describe('Token', () => {
  it('compares equality by address only', () => {
    const address = new Address('0x0000000000000000000000000000000000000001');
    const t1 = new Token(address, 'AAA', 18);
    const t2 = new Token(address, 'BBB', 6);

    expect(t1.equals(t2)).toBe(true);
  });

  it('keeps hash key consistent with address-based equality', () => {
    const address = new Address('0x0000000000000000000000000000000000000001');
    const t1 = new Token(address, 'AAA', 18);
    const t2 = new Token(address, 'BBB', 6);

    expect(t1.hashKey).toBe(t2.hashKey);
  });

  it('treats different addresses as not equal', () => {
    const t1 = new Token(
      new Address('0x0000000000000000000000000000000000000001'),
      'AAA',
      18,
    );
    const t2 = new Token(
      new Address('0x0000000000000000000000000000000000000002'),
      'AAA',
      18,
    );

    expect(t1.equals(t2)).toBe(false);
  });
});

describe('CoreTransactionRequest', () => {
  it('converts to ethers-compatible request shape', () => {
    const req = new CoreTransactionRequest({
      to: new Address('0x0000000000000000000000000000000000000001'),
      value: TokenAmount.fromHuman('0.001', 18, 'ETH'),
      data: '0x1234',
      nonce: 7,
      gasLimit: 21000n,
      maxFeePerGas: 35_000_000_000n,
      maxPriorityFee: 2_000_000_000n,
      chainId: 1,
    });

    const web3 = req.toWeb3();
    expect(web3.to).toBe('0x0000000000000000000000000000000000000001');
    expect(web3.value).toBe(1000000000000000n);
    expect(web3.data).toBe('0x1234');
    expect(web3.nonce).toBe(7);
    expect(web3.gasLimit).toBe(21000n);
    expect(web3.maxFeePerGas).toBe(35_000_000_000n);
    expect(web3.maxPriorityFeePerGas).toBe(2_000_000_000n);
    expect(web3.chainId).toBe(1);
  });
});

describe('CoreTransactionReceipt', () => {
  it('computes transaction fee in wei using integer math', () => {
    const receipt = new CoreTransactionReceipt({
      txHash: '0xabc',
      blockNumber: 1,
      status: true,
      gasUsed: 21000n,
      effectiveGasPrice: 35_000_000_000n,
      logs: [],
    });

    expect(receipt.txFee.raw).toBe(735000000000000n);
    expect(receipt.txFee.decimals).toBe(18);
    expect(receipt.txFee.symbol).toBe('ETH');
  });

  it('parses a web3 receipt and maps status correctly', () => {
    const raw = {
      hash: '0xdeadbeef',
      blockNumber: 123,
      status: 1,
      gasUsed: 21000n,
      gasPrice: 30_000_000_000n,
      logs: [],
    };

    const parsed = CoreTransactionReceipt.fromWeb3(raw as never);
    expect(parsed.txHash).toBe('0xdeadbeef');
    expect(parsed.blockNumber).toBe(123);
    expect(parsed.status).toBe(true);
    expect(parsed.gasUsed).toBe(21000n);
    expect(parsed.effectiveGasPrice).toBe(30_000_000_000n);
  });
});
