import type { BytesLike } from 'ethers';

import { ChainClient, GasPrice } from '@/chain/client';
import { ChainError } from '@/chain/errors';
import {
  Address,
  CoreTransactionReceipt,
  CoreTransactionRequest,
  TokenAmount,
} from '@/core/types';
import type { SignedTransaction } from '@/core/types';
import { WalletManager } from '@/core/wallet';

type GasPriority = 'low' | 'medium' | 'high';

/**
 * Fluent builder for Ethereum transactions.
 */
export class TransactionBuilder {
  private readonly client: ChainClient;
  private readonly wallet: WalletManager;

  private txTo?: Address;
  private txValue?: TokenAmount;
  private txData: BytesLike = '0x';
  private txNonce?: number;
  private txGasLimit?: bigint;
  private txMaxFeePerGas?: bigint;
  private txMaxPriorityFee?: bigint;
  private txChainId: number = 1;

  private estimateRequested = false;
  private estimateBuffer = 1.2;
  private gasPriority: GasPriority = 'medium';
  private gasPriceRequested = false;

  /**
   * Create a fluent transaction builder bound to a chain client and wallet.
   *
   * @param client Chain RPC client used for nonce, gas, and broadcast operations.
   * @param wallet Wallet manager used to sign built transactions.
   */
  constructor(client: ChainClient, wallet: WalletManager) {
    this.client = client;
    this.wallet = wallet;
  }

  /**
   * Set the transaction recipient.
   * @param address Destination address.
   * @returns The current builder instance for fluent chaining.
   */
  public to(address: Address): TransactionBuilder {
    this.txTo = address;
    return this;
  }

  /**
   * Set the native token value to transfer.
   * @param amount Amount to transfer.
   * @returns The current builder instance for fluent chaining.
   */
  public value(amount: TokenAmount): TransactionBuilder {
    this.txValue = amount;
    return this;
  }

  /**
   * Set calldata for contract interactions.
   * @param calldata ABI-encoded input payload.
   * @returns The current builder instance for fluent chaining.
   */
  public data(calldata: BytesLike): TransactionBuilder {
    this.txData = calldata;
    return this;
  }

  /**
   * Set an explicit transaction nonce.
   * @param nonce Non-negative nonce value.
   * @returns The current builder instance for fluent chaining.
   * @throws {ChainError} If nonce is not a non-negative integer.
   */
  public nonce(nonce: number): TransactionBuilder {
    if (!Number.isInteger(nonce) || nonce < 0) {
      throw new ChainError('Nonce must be a non-negative integer');
    }

    this.txNonce = nonce;
    return this;
  }

  /**
   * Set an explicit gas limit.
   * @param limit Gas limit in units.
   * @returns The current builder instance for fluent chaining.
   * @throws {ChainError} If the provided gas limit is not positive.
   */
  public gasLimit(limit: bigint): TransactionBuilder {
    if (limit <= 0n) {
      throw new ChainError('Gas limit must be greater than zero');
    }

    this.txGasLimit = limit;
    return this;
  }

  /**
   * Set the chain id for signing (replay protection).
   * @param chainId Positive integer chain id.
   * @returns The current builder instance for fluent chaining.
   * @throws {ChainError} If chain id is invalid.
   */
  public chainId(chainId: number): TransactionBuilder {
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new ChainError('Chain ID must be a positive integer');
    }

    this.txChainId = chainId;
    return this;
  }

  /**
   * Estimate gas and set gas limit with buffer.
   */
  public withGasEstimate(buffer: number = 1.2): TransactionBuilder {
    if (!Number.isFinite(buffer) || buffer <= 1) {
      throw new ChainError('Gas estimate buffer must be > 1');
    }

    this.estimateRequested = true;
    this.estimateBuffer = buffer;
    return this;
  }

  /**
   * Set gas price based on current network conditions.
   */
  public withGasPrice(priority: GasPriority = 'medium'): TransactionBuilder {
    this.gasPriority = priority;
    this.gasPriceRequested = true;
    return this;
  }

  /**
   * Validate and return a transaction request.
   */
  public async build(): Promise<CoreTransactionRequest> {
    this.validateBaseFields();

    const nonce =
      this.txNonce !== undefined
        ? this.txNonce
        : await this.client.getNonce(Address.fromString(this.wallet.address));

    if (
      this.gasPriceRequested ||
      this.txMaxFeePerGas === undefined ||
      this.txMaxPriorityFee === undefined
    ) {
      const gas = await this.client.getGasPrice();
      this.applyGasPrice(gas, this.gasPriority);
    }

    let tx = new CoreTransactionRequest({
      to: this.txTo!,
      value: this.txValue!,
      data: this.txData,
      nonce,
      gasLimit: this.txGasLimit,
      maxFeePerGas: this.txMaxFeePerGas,
      maxPriorityFee: this.txMaxPriorityFee,
      chainId: this.txChainId,
    });

    if (this.estimateRequested || this.txGasLimit === undefined) {
      const estimate = await this.client.estimateGas(tx);
      const gasLimit = this.applyBuffer(estimate, this.estimateBuffer);
      this.txGasLimit = gasLimit;

      tx = new CoreTransactionRequest({
        to: this.txTo!,
        value: this.txValue!,
        data: this.txData,
        nonce,
        gasLimit,
        maxFeePerGas: this.txMaxFeePerGas,
        maxPriorityFee: this.txMaxPriorityFee,
        chainId: this.txChainId,
      });
    }

    return tx;
  }

  /**
   * Build, sign, and return ready-to-send transaction.
   */
  public async buildAndSign(): Promise<SignedTransaction> {
    const tx = await this.build();
    return this.wallet.signTransaction(tx.toWeb3());
  }

  /**
   * Build, sign, send, return tx hash.
   */
  public async send(): Promise<string> {
    const signed = await this.buildAndSign();
    return this.client.sendTransaction(signed.rawTransaction);
  }

  /**
   * Build, sign, send, wait for confirmation.
   */
  public async sendAndWait(
    timeout: number = 120,
  ): Promise<CoreTransactionReceipt> {
    const txHash = await this.send();
    return this.client.waitForReceipt(txHash, timeout);
  }

  /**
   * Validate required base fields prior to building a transaction.
   * @throws {ChainError} If recipient or value is missing.
   */
  private validateBaseFields(): void {
    if (!this.txTo) {
      throw new ChainError(
        'Transaction recipient is required. Call .to(address).',
      );
    }

    if (!this.txValue) {
      throw new ChainError(
        'Transaction value is required. Call .value(amount).',
      );
    }
  }

  /**
   * Populate max fee and priority fee using the selected priority tier.
   * @param gas Current network gas snapshot.
   * @param priority Priority tier to apply.
   */
  private applyGasPrice(gas: GasPrice, priority: GasPriority): void {
    let maxPriorityFee: bigint;
    if (priority === 'low') {
      maxPriorityFee = gas.priorityFeeLow;
    } else if (priority === 'high') {
      maxPriorityFee = gas.priorityFeeHigh;
    } else {
      maxPriorityFee = gas.priorityFeeMedium;
    }

    this.txMaxPriorityFee = maxPriorityFee;
    this.txMaxFeePerGas = gas.getMaxFee(priority, 1.2);
  }

  /**
   * Apply a decimal buffer to a bigint value with fixed-point math.
   * @param value Base value.
   * @param multiplier Buffer multiplier (for example 1.2).
   * @returns Buffered bigint value.
   */
  private applyBuffer(value: bigint, multiplier: number): bigint {
    const den = 1000n;
    const num = BigInt(Math.round(multiplier * Number(den)));
    return (value * num) / den;
  }
}
