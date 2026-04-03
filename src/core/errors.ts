/**
 * Custom error class for wallet-related errors.
 */
export class WalletManagerError extends Error {
  /**
   * Error thrown for wallet-related failures. Message should be safe for logging
   * (sensitive data must be redacted earlier).
   * @param message - Human-friendly error message.
   */
  constructor(message: string) {
    super(message);
    this.name = 'WalletManagerError';
  }
}

/**
 * Custom error class for canonical serialization errors.
 */
export class CanonicalSerializerError extends Error {
  /**
   * Thrown when canonical serialization or normalization encounters an
   * unsupported or unsafe value (e.g. floating point, NaN, Infinity).
   * @param message - Explanation of the serialization error.
   */
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalSerializerError';
  }
}

/**
 * Custom error class for typed data validation errors.
 */
export class TypesError extends Error {
  /**
   * General error for type validation failures in core types (Address,
   * TokenAmount, Token, etc.).
   * @param message - Description of the type validation failure.
   */
  constructor(message: string) {
    super(message);
    this.name = 'TypesError';
  }
}
