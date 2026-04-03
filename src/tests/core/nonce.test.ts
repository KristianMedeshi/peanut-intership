import { expect, test, describe, vi } from 'vitest';

import { ChainClient } from '@/chain/client';
import { NonceManager } from '@/chain/nonce';
import { Address } from '@/core/types';

describe('NonceManager', () => {
  test('returns nonces sequentially during concurrent calls', async () => {
    // Mock the chain client
    const mockClient = {
      getNonce: vi.fn().mockResolvedValue(5),
    } as unknown as ChainClient;

    const address = Address.fromString(
      '0x1234567890123456789012345678901234567890',
    );
    const manager = new NonceManager(address, mockClient);

    // Call getNonce 3 times concurrently
    const nonces = await Promise.all([
      manager.getNonce(),
      manager.getNonce(),
      manager.getNonce(),
    ]);

    // Should pull from chain exactly 3 times (once per call as designed in the pseudo-code logic)
    expect(mockClient.getNonce).toHaveBeenCalledTimes(3);

    // Should return exactly incremented sequential numbers starting at chain base
    expect(nonces).toEqual([5, 6, 7]);
  });

  test('reset forces a new fetch from the chain', async () => {
    const mockClient = {
      getNonce: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(10),
    } as unknown as ChainClient;

    const address = Address.fromString(
      '0x1234567890123456789012345678901234567890',
    );
    const manager = new NonceManager(address, mockClient);

    const nonce1 = await manager.getNonce();
    expect(nonce1).toBe(5);

    await manager.reset();

    const nonce2 = await manager.getNonce();
    expect(nonce2).toBe(10);
    expect(mockClient.getNonce).toHaveBeenCalledTimes(2);
  });
});
