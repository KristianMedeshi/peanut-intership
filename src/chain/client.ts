import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import type { BlockTag } from 'ethers';
import type {
  TransactionReceipt as EthersTransactionReceipt,
  TransactionResponse as EthersTransactionResponse,
} from 'ethers';

import {
  RPCError,
  TransactionFailed,
  InsufficientFunds,
  NonceTooLow,
  ReplacementUnderpriced,
} from '@/chain/errors';
import {
  Address,
  TokenAmount,
  CoreTransactionReceipt,
  CoreTransactionRequest,
} from '@/core/types';

/**
 * Ethereum RPC client with reliability features.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Multiple RPC endpoint fallback
 * - Request timing/logging
 * - Proper error classification
 */
export class ChainClient {
  private readonly providerUrls: string[];
  private readonly providers: Array<JsonRpcProvider | WebSocketProvider | null>;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private nextIndex: number = 0;

  /**
   * Create a resilient Ethereum RPC client.
   *
   * @param providerUrls Ordered RPC endpoints (http(s) and/or ws(s)).
   * @param timeout Per-request timeout in seconds.
   * @param maxRetries Max attempts across rotating endpoints.
   * @throws {RPCError} If no RPC endpoint is provided.
   */
  constructor(
    providerUrls: string[],
    timeout: number = 30,
    maxRetries: number = 3,
  ) {
    if (!providerUrls || providerUrls.length === 0) {
      throw new RPCError('At least one provider URL is required');
    }

    this.providerUrls = providerUrls.slice();
    // Defer provider construction until first use to avoid eager background
    // network resolution in tests and short-lived processes.
    this.providers = this.providerUrls.map(() => null);
    this.timeout = timeout;
    this.maxRetries = Math.max(1, maxRetries);
  }

  /**
   * Get or lazily instantiate a provider for the given endpoint index.
   * @param index Provider index in `providerUrls`.
   */
  private getProvider(index: number): JsonRpcProvider | WebSocketProvider {
    const cached = this.providers[index];
    if (cached) {
      return cached;
    }

    const url = this.providerUrls[index];
    const provider = url.startsWith('ws')
      ? new WebSocketProvider(url)
      : new JsonRpcProvider(url);

    this.providers[index] = provider;
    return provider;
  }

  /** Delay helper for retry backoff. */
  private sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Race an RPC promise against a configured timeout.
   * @param promise In-flight RPC operation.
   * @param name RPC operation name for diagnostics.
   */
  private async withTimeout<T>(promise: Promise<T>, name: string): Promise<T> {
    const timeoutMs = Math.max(1, this.timeout) * 1000;

    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new RPCError(`${name} timed out after ${this.timeout}s`));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Execute an RPC operation with endpoint rotation, timeout, retry/backoff,
   * and common error classification.
   *
   * @param name Logical operation name used in logs/errors.
   * @param fn Callback that performs the provider call.
   */
  private async rpc<T>(
    name: string,
    fn: (
      provider: JsonRpcProvider | WebSocketProvider,
      url: string,
    ) => Promise<T>,
  ): Promise<T> {
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const idx = this.nextIndex++ % this.providerUrls.length;
      const provider = this.getProvider(idx);
      const url = this.providerUrls[idx];

      try {
        const start = Date.now();
        const res = await this.withTimeout(fn(provider, url), name);
        const took = Date.now() - start;
        console.debug(`[ChainClient] ${name} via ${url} took ${took}ms`);
        return res;
      } catch (err: unknown) {
        lastErr = err;
        let msg: string;
        if (err instanceof Error) {
          msg = err.message;
        } else {
          msg = String(err);
        }
        console.warn(`[ChainClient] ${name} failed on ${url}: ${msg}`);

        // Classify some common RPC errors and throw them immediately
        const low = msg.toLowerCase();
        if (low.includes('insufficient funds')) {
          throw new InsufficientFunds(msg);
        }
        if (
          low.includes('nonce too low') ||
          low.includes('replacement transaction underpriced') ||
          low.includes('replacement underpriced')
        ) {
          if (low.includes('nonce too low')) {
            throw new NonceTooLow(msg);
          }
          throw new ReplacementUnderpriced(msg);
        }

        // exponential backoff before trying next endpoint
        const backoff = 100 * Math.pow(2, attempt);
        await this.sleep(backoff);
      }
    }

    // All endpoints failed
    const lastMsg =
      lastErr instanceof Error ? lastErr.message : String(lastErr);
    const message = `All RPC endpoints failed for ${name}: ${lastMsg}`;
    throw new RPCError(message);
  }

  /**
   * Fetch account native balance.
   * @param address Address to query.
   * @returns ETH-denominated TokenAmount in wei units.
   */
  public async getBalance(address: Address): Promise<TokenAmount> {
    const raw = await this.rpc('getBalance', async (provider) => {
      return provider.getBalance(address.checksum);
    });

    return new TokenAmount(BigInt(raw), 18, 'ETH');
  }

  /**
   * Fetch account nonce from the requested block tag.
   * @param address Address to query.
   * @param blockTag Block scope (defaults to `pending`).
   */
  public async getNonce(
    address: Address,
    blockTag: BlockTag = 'pending',
  ): Promise<number> {
    const n = await this.rpc('getNonce', async (provider) => {
      return provider.getTransactionCount(address.checksum, blockTag);
    });

    return Number(n);
  }

  /**
   * Returns current gas price info (base fee, priority fee estimates).
   */
  public async getGasPrice(): Promise<GasPrice> {
    const [block, feeData] = await this.rpc('getGasPrice', async (provider) => {
      const block = await provider.getBlock('latest');
      const feeData = await provider.getFeeData();
      return [block, feeData] as const;
    });

    const baseFee = BigInt(block?.baseFeePerGas ?? 0n);

    // feeData.maxPriorityFeePerGas may be undefined; fall back to sensible default (2 gwei)
    const rawPriority =
      feeData?.maxPriorityFeePerGas ?? feeData?.maxFeePerGas ?? 2000000000n;
    const medium = BigInt(rawPriority);
    const low = medium / 2n;
    const high = (medium * 3n) / 2n;

    return new GasPrice(baseFee, low, medium, high);
  }

  /**
   * Estimate gas usage for a transaction request.
   * @param tx Transaction request.
   */
  public async estimateGas(tx: CoreTransactionRequest): Promise<bigint> {
    const res = await this.rpc('estimateGas', async (provider) => {
      return provider.estimateGas(tx.toWeb3());
    });

    return BigInt(res);
  }

  /**
   * Send and return tx hash. Does NOT wait for confirmation.
   */
  public async sendTransaction(signedTx: Uint8Array | string): Promise<string> {
    const hex =
      signedTx instanceof Uint8Array
        ? `0x${Buffer.from(signedTx).toString('hex')}`
        : signedTx.startsWith('0x')
          ? signedTx
          : `0x${signedTx}`;

    const res = await this.rpc('sendTransaction', async (provider) => {
      return await provider.send('eth_sendRawTransaction', [hex]);
    });

    return String(res);
  }

  /**
   * Wait for transaction confirmation.
   */
  public async waitForReceipt(
    txHash: string,
    timeout: number = 120,
    pollInterval: number = 1.0,
  ): Promise<CoreTransactionReceipt> {
    const deadline = Date.now() + timeout * 1000;
    let isDone = false;
    let wsUnsubscribe: (() => void) | null = null;
    let wsResult: Promise<CoreTransactionReceipt> | null = null;

    const wsIndex = this.providerUrls.findIndex((u) => u.startsWith('ws'));
    if (wsIndex !== -1) {
      const wsProvider = this.getProvider(wsIndex);
      let handler: (receipt: unknown) => void;

      wsResult = new Promise<CoreTransactionReceipt>((resolve) => {
        handler = (receipt: unknown) => {
          try {
            if (receipt) {
              const parsed = CoreTransactionReceipt.fromWeb3(
                receipt as unknown as EthersTransactionReceipt,
              );
              resolve(parsed);
            }
          } catch {
            // Ignore error; polling loop will organically pick it up
          }
        };
        // Ethers v6 provider.once(txHash) emits when the transaction is mined
        wsProvider.once(txHash, handler).catch(() => {});
      });

      wsUnsubscribe = () => {
        try {
          // off is available in BaseProvider
          wsProvider.off(txHash, handler);
        } catch {
          // Ignore
        }
      };
    }

    const pollingLoop = async (): Promise<CoreTransactionReceipt> => {
      while (Date.now() < deadline && !isDone) {
        const r = await this.getReceipt(txHash);
        if (r) {
          return r;
        }
        await this.sleep(Math.floor(pollInterval * 1000));
      }

      if (isDone) {
        // Return a promise that never resolves if we were successfully aborted by WebSocket
        return new Promise(() => {});
      }

      throw new RPCError(`Timed out waiting for receipt for ${txHash}`);
    };

    try {
      const promises: Promise<CoreTransactionReceipt>[] = [pollingLoop()];
      if (wsResult) {
        promises.push(wsResult);
      }

      const r = await Promise.race(promises);

      if (!r.status) {
        throw new TransactionFailed(txHash, r);
      }

      return r;
    } finally {
      isDone = true;
      if (wsUnsubscribe) {
        wsUnsubscribe();
      }
    }
  }

  /**
   * Fetch a transaction by hash.
   * @param txHash Transaction hash.
   * @throws {RPCError} If the transaction cannot be found.
   */
  public async getTransaction(
    txHash: string,
  ): Promise<EthersTransactionResponse> {
    const res = await this.rpc('getTransaction', async (provider) =>
      provider.getTransaction(txHash),
    );

    if (!res) {
      throw new RPCError(`Transaction not found: ${txHash}`);
    }

    return res;
  }

  /**
   * Fetch a transaction receipt if mined.
   * @param txHash Transaction hash.
   * @returns Parsed receipt or `null` if still pending/not available.
   */
  public async getReceipt(
    txHash: string,
  ): Promise<CoreTransactionReceipt | null> {
    const res = await this.rpc('getReceipt', async (provider) =>
      provider.getTransactionReceipt(txHash),
    );

    if (!res) {
      return null;
    }

    return CoreTransactionReceipt.fromWeb3(res);
  }

  /**
   * Execute `eth_call` simulation without broadcasting.
   * @param tx Transaction call request.
   * @param block Block tag for simulation state.
   */
  public async call(
    tx: CoreTransactionRequest,
    block: BlockTag = 'latest',
  ): Promise<Uint8Array | string> {
    const res = await this.rpc('call', async (provider) => {
      const callRequest = {
        ...tx.toWeb3(),
        blockTag: block,
      };
      return provider.call(callRequest);
    });

    return res;
  }

  /**
   * Monitor the mempool for pending transactions.
   * Requires at least one WebSocket endpoint configured.
   * @param callback Function to execute for each pending transaction hash
   * @returns Unsubscribe function
   */
  public async monitorPendingTransactions(
    callback: (txHash: string) => void,
  ): Promise<() => void> {
    const wsIndex = this.providerUrls.findIndex((u) => u.startsWith('ws'));

    if (wsIndex === -1) {
      throw new RPCError(
        'WebSocket support requires at least one ws:// or wss:// endpoint configured.',
      );
    }

    const wsProvider = this.getProvider(wsIndex);
    await wsProvider.on('pending', callback);

    return () => {
      wsProvider.off('pending', callback);
    };
  }
}

/**
 * Current gas price information.
 */
export class GasPrice {
  public baseFee: bigint;
  public priorityFeeLow: bigint;
  public priorityFeeMedium: bigint;
  public priorityFeeHigh: bigint;

  /**
   * Create a gas price snapshot container.
   * @param baseFee Current base fee (wei).
   * @param priorityFeeLow Low priority tip (wei).
   * @param priorityFeeMedium Medium priority tip (wei).
   * @param priorityFeeHigh High priority tip (wei).
   */
  constructor(
    baseFee: bigint,
    priorityFeeLow: bigint,
    priorityFeeMedium: bigint,
    priorityFeeHigh: bigint,
  ) {
    this.baseFee = baseFee;
    this.priorityFeeLow = priorityFeeLow;
    this.priorityFeeMedium = priorityFeeMedium;
    this.priorityFeeHigh = priorityFeeHigh;
  }

  /**
   * Calculate maxFeePerGas with buffer for base fee increase.
   * @param priority - The priority level ("low", "medium", "high")
   * @param buffer - Multiplier for the base fee (default: 1.2)
   */
  public getMaxFee(
    priority: 'low' | 'medium' | 'high' = 'medium',
    buffer: number = 1.2,
  ): bigint {
    // Apply buffer to base fee without using floating-point on BigInt.
    // Use a fixed denominator to represent the buffer multiplier.
    const DEN = 1000n;
    const mult = BigInt(Math.round(buffer * Number(DEN)));

    const bufferedBase = (this.baseFee * mult) / DEN;

    let priorityFee: bigint;
    switch (priority) {
      case 'low':
        priorityFee = this.priorityFeeLow;
        break;
      case 'high':
        priorityFee = this.priorityFeeHigh;
        break;
      default:
        priorityFee = this.priorityFeeMedium;
    }

    return bufferedBase + priorityFee;
  }
}
