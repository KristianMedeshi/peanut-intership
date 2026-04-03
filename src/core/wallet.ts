import type { TypedDataField, TypedDataDomain } from 'ethers';
import type { TransactionRequest } from 'ethers';
import { Wallet } from 'ethers';
import { Signature } from 'ethers';
import { TypedDataEncoder } from 'ethers';
import { Transaction } from 'ethers';
import { hashMessage, verifyMessage } from 'ethers';
import { SigningKey } from 'ethers';
import { readFile, writeFile } from 'node:fs/promises';

import { WalletManagerError } from '@/core/errors';
import type { Hex, SignedMessage, SignedTransaction } from '@/core/types';
import { requireEnv } from '@/lib/requireEnv';

/**
 * Manages wallet operations: key loading, signing, verification.
 *
 * Keys can be loaded from:
 * - Environment variable
 * - Encrypted keyfile (optional stretch goal)
 */
export class WalletManager {
  // Use a private readonly property so the private key is not easily accessible.
  private readonly wallet: Wallet;

  /**
   * Create a new WalletManager from a raw private key string.
   *
   * @param privateKey - Private key hex string (64 hex chars, optionally prefixed with '0x').
   * @throws {WalletManagerError} if the private key is missing or invalid.
   */
  constructor(privateKey: string) {
    if (!privateKey || typeof privateKey !== 'string') {
      throw new WalletManagerError('Private key must be provided');
    }

    WalletManager.validatePrivateKey(privateKey);

    // Ensure the key is properly hex-formatted
    const formattedKey = privateKey.startsWith('0x')
      ? privateKey
      : `0x${privateKey}`;

    try {
      this.wallet = new Wallet(formattedKey);
    } catch (error) {
      this.maskAndThrowError(error);
    }
  }

  /**
   * Load private key from environment variable.
   * @param envVar The environment variable name (default: "PRIVATE_KEY")
   */
  public static fromEnv(envVar: string = 'PRIVATE_KEY'): WalletManager {
    const envValue = requireEnv(envVar);

    WalletManager.validatePrivateKey(envValue);

    return new WalletManager(envValue);
  }

  /**
   * Generate a new random wallet.
   * Displays the private key ONCE and returns both the manager and the raw key
   * so it can be securely saved by the caller.
   */
  public static generate(showPrivateKey = false): WalletManager {
    const wallet = Wallet.createRandom();

    // Only display the private key when explicitly requested, or when the
    // environment variable `SHOW_GENERATED_KEY` is set to 'true'. By default
    // generation is silent to avoid leaking secrets in test logs.
    const shouldShow =
      showPrivateKey === true || process.env.SHOW_GENERATED_KEY === 'true';

    if (shouldShow) {
      console.warn(
        '\n======================================================================',
      );
      console.warn('⚠️  NEW WALLET GENERATED.');
      console.warn(
        'SAVE THIS PRIVATE KEY NOW. IT WILL NOT BE SHOWN OR ACCESSIBLE AGAIN:',
      );
      console.warn(wallet.privateKey);
      console.warn(
        '======================================================================\n',
      );
    }

    return new WalletManager(wallet.privateKey);
  }

  /**
   * Load an encrypted JSON keystore (geth/ethers style) and return a WalletManager.
   * @param path Filesystem path to the JSON keystore
   * @param password Password to decrypt the keystore
   */
  public static async fromKeyFile(
    path: string,
    password: string,
  ): Promise<WalletManager> {
    if (!path || typeof path !== 'string') {
      throw new WalletManagerError('Keyfile path must be a string');
    }
    if (!password || typeof password !== 'string') {
      throw new WalletManagerError('Password must be a string');
    }

    try {
      const json = await readFile(path, 'utf-8');
      const wallet = await Wallet.fromEncryptedJson(json, password);

      return new WalletManager(wallet.privateKey);
    } catch (error) {
      const rawMessage =
        error instanceof Error
          ? error.message
          : String(error ?? 'Unknown error');

      let cleanMessage = rawMessage.replace(
        /0x[a-fA-F0-9]{64}/gi,
        '[REDACTED]',
      );
      cleanMessage = cleanMessage.replace(/\b[a-fA-F0-9]{64}\b/g, '[REDACTED]');
      throw new WalletManagerError(`Failed to load keyfile: ${cleanMessage}`);
    }
  }

  /**
   * Returns checksummed address.
   */
  public get address(): Hex {
    return this.wallet.address as Hex;
  }

  /**
   * Sign an arbitrary message (with EIP-191 prefix).
   * @param message The string message to sign
   */
  public async signMessage(message: string): Promise<SignedMessage> {
    if (typeof message !== 'string') {
      throw new WalletManagerError('Message to sign must be a string.');
    }
    if (message.length === 0) {
      throw new WalletManagerError('Cannot sign an empty message.');
    }

    try {
      // 1. Calculate the Ethereum-specific EIP-191 message hash
      const messageHash = hashMessage(message);

      // 2. Sign the message
      const rawSignature = await this.wallet.signMessage(message);

      // 3. Parse components for the typed struct using ethers v6 Signature class
      const parsed = Signature.from(rawSignature);

      return {
        messageHash: messageHash as Hex,
        signature: rawSignature as Hex,
        v: parsed.v,
        r: parsed.r as Hex,
        s: parsed.s as Hex,
      };
    } catch (error) {
      this.maskAndThrowError(error);
    }
  }

  /**
   * Sign EIP-712 typed data (used by many DeFi protocols).
   * @param domain The EIP-712 domain separator object
   * @param types The EIP-712 type definitions
   * @param value The actual data values to sign
   */
  public async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<SignedMessage> {
    WalletManager.validateTypedData(domain, types, value);

    try {
      // 1. Calculate the EIP-712 typed data hash using TypedDataEncoder
      const messageHash = TypedDataEncoder.hash(domain, types, value);

      // 2. Sign the data (ethers automatically calculates the primaryType internally)
      const rawSignature = await this.wallet.signTypedData(
        domain,
        types,
        value,
      );

      // 3. Parse components
      const parsed = Signature.from(rawSignature);

      return {
        messageHash: messageHash as Hex,
        signature: rawSignature as Hex,
        v: parsed.v,
        r: parsed.r as Hex,
        s: parsed.s as Hex,
      };
    } catch (error) {
      this.maskAndThrowError(error);
    }
  }

  /**
   * Sign a transaction object.
   * @param tx The transaction object/dictionary
   */
  public async signTransaction(
    tx: TransactionRequest,
  ): Promise<SignedTransaction> {
    if (!tx || typeof tx !== 'object') {
      throw new WalletManagerError('Transaction request must be an object.');
    }

    try {
      // 1. Sign the transaction payload (ethers internally RLP serializes, hashes, and signs)
      const rawTransaction = await this.wallet.signTransaction(tx);

      // 2. Parse the transaction back into an object to extract components
      const parsedTx = Transaction.from(rawTransaction);

      // Since we just signed it, the signature and hash are guaranteed to be present.
      const sig = parsedTx.signature!;

      return {
        transactionHash: parsedTx.hash as Hex,
        rawTransaction: rawTransaction as Hex,
        v: sig.v,
        r: sig.r as Hex,
        s: sig.s as Hex,
      };
    } catch (error) {
      this.maskAndThrowError(error);
    }
  }

  /**
   * Compute the public key for the current wallet.
   *
   * @param compressed - If true, returns the compressed (33-byte) public key, otherwise the uncompressed (65-byte) form.
   * @returns Public key hex string (0x-prefixed).
   * @throws {WalletManagerError} when the operation fails; the underlying error will be masked.
   */
  getPublicKey(compressed = false): string {
    try {
      return SigningKey.computePublicKey(this.wallet.privateKey, compressed);
    } catch (error) {
      this.maskAndThrowError(error);
    }
  }

  /**
   * Export this wallet to an encrypted JSON keystore (geth/ethers v3 format).
   * The file will be written with restrictive permissions when possible.
   * @param path Filesystem path to write the keystore JSON
   * @param password Password to encrypt the keystore
   */
  public async toKeyFile(path: string, password: string): Promise<void> {
    if (!path || typeof path !== 'string') {
      throw new WalletManagerError('Keyfile path must be a string');
    }
    if (!password || typeof password !== 'string') {
      throw new WalletManagerError('Password must be a string');
    }

    try {
      const encrypted = await this.wallet.encrypt(password);
      await writeFile(path, encrypted, { encoding: 'utf-8', mode: 0o600 });
    } catch (error) {
      this.maskAndThrowError(error);
    }
  }

  static verifySignedMessage(
    message: string,
    signature: string,
    expectedAddress: string,
  ): boolean {
    const recovered = verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  }

  /**
   * String representation of the WalletManager.
   * MUST NOT expose private key.
   */
  public toString(): string {
    return `WalletManager(address=${this.address})`;
  }

  /**
   * Custom representation for Node.js console.log (inspect)
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }

  /**
   * Mask out any 64-character hex strings (which could be the private key) from error messages.
   */
  /**
   * Mask out any private-key-like hex strings from error messages and rethrow
   * as a WalletManagerError so secrets are not leaked in logs or stack traces.
   *
   * @param error - The original error object to sanitize and rethrow.
   * @throws {WalletManagerError}
   */
  private maskAndThrowError(error: unknown): never {
    const rawMessage =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');

    let cleanMessage = rawMessage.replace(/0x[a-fA-F0-9]{64}/gi, '[REDACTED]');

    // Secondary safety fallback: specifically look for this wallet's key if instantiated
    if (this.wallet?.privateKey) {
      cleanMessage = cleanMessage.replace(this.wallet.privateKey, '[REDACTED]');
      // Clean up without 0x prefix just in case
      cleanMessage = cleanMessage.replace(
        this.wallet.privateKey.substring(2),
        '[REDACTED]',
      );
    }

    throw new WalletManagerError(`Operation failed: ${cleanMessage}`);
  }

  private static validatePrivateKey(key: string): void {
    if (typeof key !== 'string') {
      throw new WalletManagerError('Private key must be a string');
    }

    const formattedKey = key.startsWith('0x') ? key : `0x${key}`;
    if (!/^0x[a-fA-F0-9]{64}$/.test(formattedKey)) {
      throw new WalletManagerError(
        'Invalid private key format. Must be a 64-character hex string, optionally prefixed with 0x.',
      );
    }
  }

  private static validateTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
  ): void {
    if (!domain || typeof domain !== 'object')
      throw new WalletManagerError('Invalid EIP-712 domain');
    if (!types || typeof types !== 'object' || Object.keys(types).length === 0)
      throw new WalletManagerError('EIP-712 types cannot be empty');
    if (!value || typeof value !== 'object')
      throw new WalletManagerError('EIP-712 value cannot be empty');
    if ('EIP712Domain' in types)
      throw new WalletManagerError(
        'Do not include EIP712Domain in types dictionary; ethers handles it automatically.',
      );
  }
}
