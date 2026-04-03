import {
  formatUnits,
  getAddress,
  hexlify,
  isAddress,
  parseUnits,
  type TransactionRequest as EthersTransactionRequest,
  type TransactionReceipt as EthersTransactionReceipt,
} from 'ethers';
import type { BytesLike } from 'ethers';

import { TypesError } from '@/core/errors';

/**
 * Ethereum address with validation and checksumming.
 */
export class Address {
  readonly value: string;
  /**
   * Construct an Address instance and validate/convert to checksum form.
   *
   * @param value - Any string representation of an Ethereum address (checksummed or not).
   * @throws {TypesError} if the address is not a valid Ethereum address.
   */
  constructor(value: string) {
    if (!isAddress(value)) {
      throw new TypesError(`Invalid Ethereum address: ${value}`);
    }

    this.value = getAddress(value);
  }

  /**
   * Create an Address from a string.
   * @param value - Address string
   */
  public static fromString(value: string): Address {
    return new Address(value);
  }

  /** Returns the EIP-55 checksummed address. */
  public get checksum(): string {
    return this.value;
  }

  /** Returns the lowercase hex address (useful as map keys). */
  public get lower(): string {
    return this.value.toLowerCase();
  }

  /**
   * Case-insensitive equality check between Address instances.
   * @param other - Another Address instance to compare.
   */
  public equals(other: unknown): boolean {
    if (!(other instanceof Address)) {
      return false;
    }

    return this.lower === other.lower;
  }

  public toString(): string {
    return this.value;
  }
}

/**
 * Represents a token amount with proper decimal handling.
 *
 * Internally stores raw integer (wei-equivalent) as bigint.
 * Provides human-readable formatting.
 */
export class TokenAmount {
  readonly raw: bigint;
  readonly decimals: number;
  readonly symbol?: string;
  /**
   * TokenAmount stores amounts as integer `bigint` values with a fixed
   * `decimals` scale (e.g., 18 for ETH). This avoids floating point errors.
   *
   * @param raw - Raw integer amount (wei-equivalent) as bigint.
   * @param decimals - Token decimals (non-negative integer).
   * @param symbol - Optional token symbol for display.
   * @throws {TypesError} on invalid inputs.
   */
  constructor(raw: bigint, decimals: number, symbol?: string) {
    if (typeof raw !== 'bigint') {
      throw new TypesError('Token raw amount must be a bigint.');
    }
    if (decimals < 0 || !Number.isInteger(decimals)) {
      throw new TypesError('Token decimals must be a non-negative integer.');
    }

    this.raw = raw;
    this.decimals = decimals;
    this.symbol = symbol;
  }

  /**
   * Parse a human-readable decimal string (e.g. "1.5") into a TokenAmount
   * with integer `raw` units using the provided `decimals` scale.
   *
   * @param amount - Human-readable decimal string.
   * @param decimals - Token decimal places.
   * @param symbol - Optional symbol to attach.
   * @returns TokenAmount
   */
  public static fromHuman(
    amount: string,
    decimals: number,
    symbol?: string,
  ): TokenAmount {
    if (typeof amount !== 'string' || amount.trim().length === 0) {
      throw new TypesError('Human-readable token amount must be a string.');
    }

    return new TokenAmount(parseUnits(amount, decimals), decimals, symbol);
  }

  /** Return a human-readable decimal string (formatted according to decimals). */
  public get human(): string {
    return formatUnits(this.raw, this.decimals);
  }

  /**
   * Add two TokenAmount values. Both must have the same `decimals`.
   * @throws {TypesError} when decimals differ.
   */
  public add(other: TokenAmount): TokenAmount {
    if (this.decimals !== other.decimals) {
      throw new TypesError('Cannot add token amounts with different decimals.');
    }

    return new TokenAmount(this.raw + other.raw, this.decimals, this.symbol);
  }

  /**
   * Multiply the token amount by a factor. Supports integer `bigint` factors
   * or a decimal string which will be parsed with 18 fixed-point precision.
   *
   * @param factor - Multiplication factor as bigint or decimal string.
   * @returns New TokenAmount scaled by the factor.
   */
  public multiply(factor: string | bigint): TokenAmount {
    if (typeof factor === 'bigint') {
      return new TokenAmount(this.raw * factor, this.decimals, this.symbol);
    }

    if (typeof factor !== 'string' || factor.trim().length === 0) {
      throw new TypesError(
        'Multiplication factor must be a bigint or decimal string.',
      );
    }

    // Parse multiplier to fixed precision, then scale down to keep integer math exact.
    const factorMultiplier = parseUnits(factor.toString(), 18);
    const newRaw = (this.raw * factorMultiplier) / 10n ** 18n;

    return new TokenAmount(newRaw, this.decimals, this.symbol);
  }

  public toString(): string {
    return `${this.human} ${this.symbol || ''}`.trim();
  }
}

/**
 * Represents an ERC-20 token with its on-chain metadata.
 *
 * Identity is by address only — two Token instances at the same address
 * are equal regardless of symbol/decimals (those are metadata, not identity).
 *
 * This type will be used extensively from Week 2 onward (AMM math, routing, etc.).
 */
export class Token {
  public readonly address: Address;
  public readonly symbol: string;
  public readonly decimals: number;

  /**
   * Represent an ERC-20 token's on-chain identity and metadata.
   *
   * @param address - The token contract address as an `Address` instance.
   * @param symbol - Token symbol (informational only).
   * @param decimals - Token decimals (informational only).
   */
  constructor(address: Address, symbol: string, decimals: number) {
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new TypesError('Token decimals must be a non-negative integer.');
    }
    this.address = address;
    this.symbol = symbol;
    this.decimals = decimals;
  }

  /** Equality by token contract address only. */
  public equals(other: unknown): boolean {
    if (!(other instanceof Token)) {
      return false;
    }
    return this.address.equals(other.address);
  }

  /**
   * TypeScript doesn't have a built-in __hash__ mechanism for Sets/Maps
   * beyond object identity. We expose the lower address to use as a dictionary key.
   */
  /**
   * A stable hash key suitable for Map/Set keys: the lowercase address.
   * Use this when you need a deterministic string identity for the token.
   */
  public get hashKey(): string {
    return this.address.lower;
  }

  public toString(): string {
    return `${this.symbol} (${this.address.checksum})`;
  }
}

/**
 * A transaction ready to be signed.
 */
export class CoreTransactionRequest {
  public to: Address;
  public value: TokenAmount;
  public data: BytesLike;
  public nonce?: number;
  public gasLimit?: bigint;
  public maxFeePerGas?: bigint;
  public maxPriorityFee?: bigint;
  public chainId: number = 1;

  /**
   * Create a transaction request ready to be converted into a web3/Ethers
   * transaction object and signed.
   *
   * @param params - Transaction fields (to, value, data, optional gas/nonce/chain).
   */
  constructor(params: {
    to: Address;
    value: TokenAmount;
    data?: BytesLike;
    nonce?: number;
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFee?: bigint;
    chainId?: number;
  }) {
    this.to = params.to;
    this.value = params.value;
    this.data = params.data ?? '0x';
    this.nonce = params.nonce;
    this.gasLimit = params.gasLimit;
    this.maxFeePerGas = params.maxFeePerGas;
    this.maxPriorityFee = params.maxPriorityFee;
    this.chainId = params.chainId ?? 1;
  }

  /** Convert to web3-compatible object/dictionary. */
  public toWeb3(): EthersTransactionRequest {
    return {
      to: this.to.checksum,
      value: this.value.raw,
      data: hexlify(this.data),
      nonce: this.nonce,
      gasLimit: this.gasLimit,
      maxFeePerGas: this.maxFeePerGas,
      maxPriorityFeePerGas: this.maxPriorityFee,
      chainId: this.chainId,
    };
  }
}

/**
 * Parsed transaction receipt.
 */
export class CoreTransactionReceipt {
  public readonly txHash: string;
  public readonly blockNumber: number;
  public readonly status: boolean;
  public readonly gasUsed: bigint;
  public readonly effectiveGasPrice: bigint;
  public readonly logs: unknown[];

  /**
   * Parsed transaction receipt abstraction.
   *
   * @param params - Receipt fields extracted from a provider's receipt object.
   */
  public constructor(params: {
    txHash: string;
    blockNumber: number;
    status: boolean;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
    logs?: unknown[];
  }) {
    this.txHash = params.txHash;
    this.blockNumber = params.blockNumber;
    this.status = params.status;
    this.gasUsed = params.gasUsed;
    this.effectiveGasPrice = params.effectiveGasPrice;
    this.logs = params.logs ?? [];
  }

  /** Returns transaction fee as TokenAmount. */
  public get txFee(): TokenAmount {
    return new TokenAmount(this.gasUsed * this.effectiveGasPrice, 18, 'ETH');
  }

  /** Parse from web3 receipt dictionary. */
  static fromWeb3(receipt: EthersTransactionReceipt): CoreTransactionReceipt {
    const txHash = receipt.hash;

    if (!txHash) {
      throw new TypesError('Receipt is missing transaction hash.');
    }

    if (receipt.status == null) {
      throw new TypesError('Receipt is missing transaction status.');
    }

    return new CoreTransactionReceipt({
      txHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.gasPrice,
      logs: Array.from(receipt.logs ?? []),
    });
  }
}

/**
 * Strongly typed hexadecimal string format.
 */
export type Hex = `0x${string}`;

/**
 * Represents a fully parsed signed message payload.
 */
export interface SignedMessage {
  messageHash: Hex;
  signature: Hex;
  v: number;
  r: Hex;
  s: Hex;
}

/**
 * Represents a fully parsed signed transaction payload.
 */
export interface SignedTransaction {
  transactionHash: Hex;
  rawTransaction: Hex;
  v: number;
  r: Hex;
  s: Hex;
}
