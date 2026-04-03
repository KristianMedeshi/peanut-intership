import { ChainClient } from '@/chain/client';
import { Address } from '@/core/types';

/**
 * Manages nonces securely for concurrent transaction submissions.
 * Prevents race conditions when building multiple transactions at once.
 */
export class NonceManager {
  private localNonce: number | null = null;
  private readonly address: Address;
  private readonly client: ChainClient;
  private lock: Promise<void> = Promise.resolve();

  /**
   * Create a nonce manager for a specific wallet address.
   * @param address Sender address whose nonce stream is managed.
   * @param client Chain client used to read pending nonce from RPC.
   */
  constructor(address: Address, client: ChainClient) {
    this.address = address;
    this.client = client;
  }

  /**
   * Safely acquires the next valid nonce for the configured address.
   * Pulls from the chain on the first request or tracks locally.
   */
  public async getNonce(): Promise<number> {
    const release = await this.acquireLock();
    try {
      const chainNonce = await this.client.getNonce(this.address, 'pending');

      if (this.localNonce === null) {
        this.localNonce = chainNonce;
      } else {
        this.localNonce = Math.max(this.localNonce, chainNonce);
      }

      const nonce = this.localNonce;
      this.localNonce++;
      return nonce;
    } finally {
      release();
    }
  }

  /**
   * Resets local tracking forcing a fresh call to the node on the next request.
   */
  public async reset(): Promise<void> {
    const release = await this.acquireLock();
    try {
      this.localNonce = null;
    } finally {
      release();
    }
  }

  /**
   * Acquires the concurrency lock, returning a release lambda.
   */
  private acquireLock(): Promise<() => void> {
    let release!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    const oldLock = this.lock;
    this.lock = oldLock.then(() => nextLock);

    return oldLock.then(() => release);
  }
}
