import { Interface } from 'ethers';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { decodeFunction, parseArgs } from '@/chain/analyzer/index';

const runAnalyzer = (args: string[]) =>
  spawnSync('npx', ['tsx', 'src/chain/analyzer/entry.ts', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

describe('src/chain/analyzer CLI', () => {
  it('fails with usage when no tx hash is provided', () => {
    const result = runAnalyzer([]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Usage: tsx src/chain/analyzer/entry.ts <tx_hash> [--rpc URL] [--format text|json] [--no-trace] [--no-mev]',
    );
  });

  it('fails with clear message for invalid tx hash format', () => {
    const result = runAnalyzer(['not-a-hash']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid transaction hash');
  });

  it('fails with clear error for invalid format value', () => {
    const result = runAnalyzer([
      '0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838',
      '--format',
      'yaml',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid format. Expected text or json.');
  });

  it('fails with clear error for unknown flag', () => {
    const result = runAnalyzer([
      '0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838',
      '--unknown',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown argument: --unknown');
  });
});

describe('src/chain/analyzer helpers', () => {
  it('parses valid arguments and flags', () => {
    const parsed = parseArgs([
      '0x' + 'a'.repeat(64),
      '--rpc',
      'http://localhost:8545',
      '--format',
      'json',
      '--no-trace',
      '--no-mev',
    ]);

    expect(parsed.txHash).toBe('0x' + 'a'.repeat(64));
    expect(parsed.rpcUrl).toBe('http://localhost:8545');
    expect(parsed.format).toBe('json');
    expect(parsed.trace).toBe(false);
    expect(parsed.mev).toBe(false);
  });

  it('decodes known ERC20 transfer calldata', () => {
    const erc20 = new Interface([
      'function transfer(address to,uint256 amount)',
    ]);

    const data = erc20.encodeFunctionData('transfer', [
      '0x0000000000000000000000000000000000000001',
      123n,
    ]);

    const decoded = decodeFunction(data, 0n);

    expect(decoded.selector).toBe(data.slice(0, 10));
    expect(decoded.protocol).toBe('ERC20');
    expect(decoded.signature).toBe('transfer(address,uint256)');
    expect(decoded.args?.some((a) => a.includes('amount: 123'))).toBe(true);
  });

  it('returns selector-only details for unknown function data', () => {
    const data = '0xdeadbeef' + '0'.repeat(64);
    const decoded = decodeFunction(data, 0n);

    expect(decoded.selector).toBe('0xdeadbeef');
    expect(decoded.protocol).toBeUndefined();
    expect(decoded.signature).toBeUndefined();
    expect(decoded.args).toBeUndefined();
  });

  it('returns 0x selector for short calldata', () => {
    const decoded = decodeFunction('0x12', 0n);
    expect(decoded.selector).toBe('0x');
  });
});
