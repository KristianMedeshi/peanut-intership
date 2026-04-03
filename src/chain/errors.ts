import { CoreTransactionReceipt } from '@/core/types';

/**
 * Base class for chain errors.
 */
export class ChainError extends Error {
  /**
   * Base class for all chain module errors.
   * @param message Optional error message.
   */
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;

    // Fix prototype chain for built-in Error extension in TS
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * RPC request failed.
 */
export class RPCError extends ChainError {
  public code?: number;

  /**
   * RPC transport/provider error.
   * @param message Human-readable error details.
   * @param code Optional JSON-RPC error code.
   */
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

/**
 * Transaction reverted.
 */
export class TransactionFailed extends ChainError {
  public txHash: string;
  public receipt: CoreTransactionReceipt;

  /**
   * Transaction execution failed (receipt status = 0).
   * @param txHash Reverted transaction hash.
   * @param receipt Parsed transaction receipt for diagnostics.
   */
  constructor(txHash: string, receipt: CoreTransactionReceipt) {
    super(`Transaction ${txHash} reverted`);
    this.txHash = txHash;
    this.receipt = receipt;
  }
}

/**
 * Not enough balance for transaction.
 */
export class InsufficientFunds extends ChainError {}

/**
 * Nonce already used.
 */
export class NonceTooLow extends ChainError {}

/**
 * Replacement transaction gas too low.
 */
export class ReplacementUnderpriced extends ChainError {}
