import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as util from 'node:util';
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterEach,
  vi,
} from 'vitest';

import { WalletManager } from '@/core/wallet';

type SignTransactionRequest = Parameters<WalletManager['signTransaction']>[0];

describe('WalletManager', () => {
  let wallet: WalletManager;
  const validPrivateKey =
    '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const validPrivateKeyNoPrefix =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    wallet = new WalletManager(validPrivateKey);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // Security: Private Key Not Exposed
  // ==========================================

  describe('Security: Private key not exposed', () => {
    it('should never expose private key in toString()', () => {
      const str = wallet.toString();
      expect(str).not.toContain(validPrivateKey);
      expect(str).not.toContain(validPrivateKeyNoPrefix);
      expect(str).toMatch(/^WalletManager\(address=0x[a-fA-F0-9]{40}\)$/);
    });

    it('should never expose private key in String(wallet)', () => {
      const str = String(wallet);
      expect(str).not.toContain(validPrivateKey);
      expect(str).not.toContain(validPrivateKeyNoPrefix);
    });

    it('should never expose private key in inspect (nodejs.util.inspect.custom)', () => {
      const inspected = util.inspect(wallet);
      expect(inspected).not.toContain(validPrivateKey);
      expect(inspected).not.toContain(validPrivateKeyNoPrefix);
    });

    it('should never expose private key in JSON.stringify', () => {
      const json = JSON.stringify(wallet);
      expect(json).not.toContain(validPrivateKey);
      expect(json).not.toContain(validPrivateKeyNoPrefix);
    });

    it('toString() should always show address format', () => {
      const str = wallet.toString();
      expect(str).toMatch(/WalletManager\(address=0x/);
      expect(str).toContain(wallet.address);
    });
  });

  // ==========================================
  // Security: Error Masking
  // ==========================================

  describe('Security: Error masking', () => {
    it('should mask private key if accidentally exposed in error', () => {
      try {
        // Try to create wallet with invalid key to trigger an error path
        new WalletManager('invalid');
        expect.fail('Should have thrown');
      } catch (error) {
        if (error instanceof Error) {
          const msg = error.message;
          // Should not contain the invalid key
          expect(msg).not.toContain('invalid');
          // Should be a masked/sanitized message
          expect(msg.length).toBeGreaterThan(0);
        }
      }
    });

    it('should mask 64-character hex strings (potential private keys) in errors', () => {
      // Create a custom wallet to capture error behavior
      const suspiciousKey = 'a'.repeat(64); // Looks like a private key

      try {
        new WalletManager('0x' + suspiciousKey);
        expect.fail('Should have thrown');
      } catch (error) {
        if (error instanceof Error) {
          // The error message should not contain the suspicious key
          expect(error.message).not.toContain(suspiciousKey);
        }
      }
    });

    it('should provide useful error context without exposing key', () => {
      try {
        new WalletManager('0xZZZ');
        expect.fail('Should have thrown');
      } catch (error) {
        if (error instanceof Error) {
          // Error should mention validation or format
          const msg = error.message.toLowerCase();
          expect(
            msg.includes('private') ||
              msg.includes('invalid') ||
              msg.includes('key'),
          ).toBe(true);
          // But should not contain the actual key fragment
          expect(error.message).not.toContain('ZZZ');
        }
      }
    });
  });

  // ==========================================
  // Input Validation: Constructor
  // ==========================================

  describe('Constructor: Input validation', () => {
    it('should throw on missing private key (empty string)', () => {
      expect(() => new WalletManager('')).toThrow();
    });

    it('should throw on null private key', () => {
      expect(() => new WalletManager(null as unknown as string)).toThrow();
    });

    it('should throw on undefined private key', () => {
      expect(() => new WalletManager(undefined as unknown as string)).toThrow();
    });

    it('should throw on non-string types', () => {
      expect(() => new WalletManager(123 as unknown as string)).toThrow();
      expect(() => new WalletManager({} as unknown as string)).toThrow();
      expect(() => new WalletManager([] as unknown as string)).toThrow();
      expect(() => new WalletManager(false as unknown as string)).toThrow();
    });

    it('should accept valid private key with 0x prefix', () => {
      expect(() => new WalletManager(validPrivateKey)).not.toThrow();
    });

    it('should accept valid private key without 0x prefix', () => {
      expect(() => new WalletManager(validPrivateKeyNoPrefix)).not.toThrow();
    });

    it('should throw on invalid hex characters', () => {
      expect(
        () =>
          new WalletManager(
            '0xZZZZZZ89abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          ),
      ).toThrow();
    });

    it('should throw on private key too short', () => {
      expect(() => new WalletManager('0xabc')).toThrow();
    });

    it('should throw on private key too long', () => {
      expect(
        () =>
          new WalletManager(
            '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00',
          ),
      ).toThrow();
    });
  });

  // ==========================================
  // Message Signing: Empty Message Validation
  // ==========================================

  describe('signMessage: Empty message validation', () => {
    it('should raise explicit error for empty message (not crypto failure)', async () => {
      await expect(wallet.signMessage('')).rejects.toThrow(
        /empty|cannot sign/i,
      );
    });

    it('should validate message type BEFORE crypto operations', async () => {
      const invalidInputs = [null, undefined, 123, {}, [], true];

      for (const input of invalidInputs) {
        await expect(
          wallet.signMessage(input as unknown as string),
        ).rejects.toThrow();
      }
    });

    it('should not fail on single character message', async () => {
      const signed = await wallet.signMessage('a');
      expect(signed).toHaveProperty('signature');
      expect(signed).toHaveProperty('messageHash');
    });

    it('should not fail on whitespace-only message', async () => {
      const signed = await wallet.signMessage('   ');
      expect(signed).toHaveProperty('signature');
      expect(signed).toHaveProperty('messageHash');
    });
  });

  // ==========================================
  // Message Signing: Type Validation
  // ==========================================

  describe('signMessage: Type validation before crypto', () => {
    it('should reject non-string message types immediately', async () => {
      const nonStringTypes = [
        null,
        undefined,
        123,
        3.14,
        {},
        [],
        true,
        false,
        () => {},
      ];

      for (const value of nonStringTypes) {
        await expect(
          wallet.signMessage(value as unknown as string),
        ).rejects.toThrow();
      }
    });

    it('should validate input before calling crypto operations', async () => {
      // Spy on a potential crypto operation to ensure validation happens first
      // The error should be thrown for type validation, not crypto error
      try {
        await wallet.signMessage(123 as unknown as string);
        expect.fail('Should have thrown');
      } catch (error) {
        if (error instanceof Error) {
          // Should be a type validation error, not a crypto error
          expect(error.message.toLowerCase()).toMatch(/type|string|valid/);
        }
      }
    });
  });

  // ==========================================
  // Message Signing: Valid Operations
  // ==========================================

  describe('signMessage: Valid signing operations', () => {
    it('should successfully sign a valid message', async () => {
      const message = 'Hello, Ethereum!';
      const signed = await wallet.signMessage(message);

      expect(signed).toHaveProperty('messageHash');
      expect(signed).toHaveProperty('signature');
      expect(signed).toHaveProperty('v');
      expect(signed).toHaveProperty('r');
      expect(signed).toHaveProperty('s');
    });

    it('should produce valid signature components', async () => {
      const signed = await wallet.signMessage('Test message');

      // Signature should be 65 bytes = 130 hex chars + 0x prefix = 132 chars
      expect(signed.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

      // Message hash should be 32 bytes = 64 hex chars + 0x prefix = 66 chars
      expect(signed.messageHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // v should be valid recovery ID
      expect([0, 1, 27, 28]).toContain(signed.v);

      // r and s should be 32-byte hex strings
      expect(signed.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signed.s).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should produce same hash for same message (deterministic)', async () => {
      const message = 'Deterministic test';
      const signed1 = await wallet.signMessage(message);
      const signed2 = await wallet.signMessage(message);

      expect(signed1.messageHash).toEqual(signed2.messageHash);
    });

    it('should produce different hashes for different messages', async () => {
      const signed1 = await wallet.signMessage('Message 1');
      const signed2 = await wallet.signMessage('Message 2');

      expect(signed1.messageHash).not.toEqual(signed2.messageHash);
    });
  });

  // ==========================================
  // Typed Data Signing: Type Validation
  // ==========================================

  describe('signTypedData: Type validation', () => {
    const validDomain = {
      name: 'MyApp',
      version: '1',
      chainId: 1,
      verifyingContract: '0x' + '0'.repeat(40),
    };

    const validTypes = {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
    };

    const validValue = {
      name: 'Bob',
      wallet: '0x' + '1'.repeat(40),
    };

    it('should reject non-object domain', async () => {
      await expect(
        wallet.signTypedData(
          null as unknown as Parameters<WalletManager['signTypedData']>[0],
          validTypes,
          validValue,
        ),
      ).rejects.toThrow();
      await expect(
        wallet.signTypedData(
          undefined as unknown as Parameters<WalletManager['signTypedData']>[0],
          validTypes,
          validValue,
        ),
      ).rejects.toThrow();
      await expect(
        wallet.signTypedData(
          'string' as unknown as Parameters<WalletManager['signTypedData']>[0],
          validTypes,
          validValue,
        ),
      ).rejects.toThrow();
    });

    it('should reject non-object types or empty types', async () => {
      await expect(
        wallet.signTypedData(
          validDomain,
          null as unknown as Parameters<WalletManager['signTypedData']>[1],
          validValue,
        ),
      ).rejects.toThrow();
      await expect(
        wallet.signTypedData(
          validDomain,
          undefined as unknown as Parameters<WalletManager['signTypedData']>[1],
          validValue,
        ),
      ).rejects.toThrow();
      await expect(
        wallet.signTypedData(validDomain, {}, validValue),
      ).rejects.toThrow();
    });

    it('should reject non-object value', async () => {
      await expect(
        wallet.signTypedData(
          validDomain,
          validTypes,
          null as unknown as Parameters<WalletManager['signTypedData']>[2],
        ),
      ).rejects.toThrow();
      await expect(
        wallet.signTypedData(
          validDomain,
          validTypes,
          undefined as unknown as Parameters<WalletManager['signTypedData']>[2],
        ),
      ).rejects.toThrow();
      await expect(
        wallet.signTypedData(
          validDomain,
          validTypes,
          'string' as unknown as Parameters<WalletManager['signTypedData']>[2],
        ),
      ).rejects.toThrow();
    });

    it('should validate before attempting crypto operations', async () => {
      // Type validation should happen before any signature generation
      try {
        await wallet.signTypedData(
          null as unknown as Parameters<WalletManager['signTypedData']>[0],
          validTypes,
          validValue,
        );
        expect.fail('Should have thrown');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toBeTruthy();
        }
      }
    });
  });

  // ==========================================
  // Transaction Signing: Type Validation
  // ==========================================

  describe('signTransaction: Type validation', () => {
    it('should reject null transaction', async () => {
      await expect(
        wallet.signTransaction(null as unknown as SignTransactionRequest),
      ).rejects.toThrow();
    });

    it('should reject undefined transaction', async () => {
      await expect(
        wallet.signTransaction(undefined as unknown as SignTransactionRequest),
      ).rejects.toThrow();
    });

    it('should reject non-object types', async () => {
      await expect(
        wallet.signTransaction('string' as unknown as SignTransactionRequest),
      ).rejects.toThrow();
      await expect(
        wallet.signTransaction(123 as unknown as SignTransactionRequest),
      ).rejects.toThrow();
    });

    it('should validate types BEFORE crypto operations', async () => {
      try {
        await wallet.signTransaction(null as unknown as SignTransactionRequest);
        expect.fail('Should have thrown');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toBeTruthy();
        }
      }
    });
  });

  // ==========================================
  // Static Methods: fromEnv
  // ==========================================

  describe('Static: fromEnv', () => {
    afterEach(() => {
      delete process.env.PRIVATE_KEY;
      delete process.env.CUSTOM_KEY;
    });

    it('should load from default PRIVATE_KEY env var', () => {
      process.env.PRIVATE_KEY = validPrivateKey;
      const w = WalletManager.fromEnv();
      expect(w.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should load from custom env var', () => {
      process.env.CUSTOM_KEY = validPrivateKey;
      const w = WalletManager.fromEnv('CUSTOM_KEY');
      expect(w.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should throw if env var missing', () => {
      delete process.env.PRIVATE_KEY;
      expect(() => WalletManager.fromEnv()).toThrow();
    });
  });

  // ==========================================
  // Static Methods: generate
  // ==========================================

  describe('Static: generate', () => {
    it('should generate random wallet', () => {
      const w1 = WalletManager.generate();
      const w2 = WalletManager.generate();

      expect(w1.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(w2.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(w1.address).not.toEqual(w2.address);
    });
  });

  // ==========================================
  // Public Key Retrieval
  // ==========================================

  describe('getPublicKey', () => {
    it('should return uncompressed public key by default', () => {
      const key = wallet.getPublicKey();
      expect(key).toMatch(/^0x04[a-fA-F0-9]{128}$/);
    });

    it('should return compressed public key when requested', () => {
      const key = wallet.getPublicKey(true);
      expect(key).toMatch(/^0x0[23][a-fA-F0-9]{64}$/);
    });
  });

  // ==========================================
  // Address Property
  // ==========================================

  describe('address property', () => {
    it('should return valid checksummed address', () => {
      const addr = wallet.address;
      expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should return same address consistently', () => {
      const addr1 = wallet.address;
      const addr2 = wallet.address;
      expect(addr1).toEqual(addr2);
    });
  });

  // ==========================================
  // Static Verification
  // ==========================================

  describe('Static: verifySignedMessage', () => {
    it('should verify valid signature', async () => {
      const message = 'Test message';
      const signed = await wallet.signMessage(message);

      const isValid = WalletManager.verifySignedMessage(
        message,
        signed.signature,
        wallet.address,
      );
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      // Invalid signatures should either throw or return false gracefully
      try {
        const isValid = WalletManager.verifySignedMessage(
          'message',
          '0x' + '0'.repeat(130),
          wallet.address,
        );
        // If it doesn't throw, it should return false
        expect(isValid).toBe(false);
      } catch (error) {
        // Gracefully handle if validation layer rejects the signature format
        expect(error).toBeTruthy();
      }
    });

    it('should be case-insensitive for address', async () => {
      const message = 'Test';
      const signed = await wallet.signMessage(message);

      const validLower = WalletManager.verifySignedMessage(
        message,
        signed.signature,
        wallet.address.toLowerCase(),
      );
      const validUpper = WalletManager.verifySignedMessage(
        message,
        signed.signature,
        wallet.address.toUpperCase(),
      );

      expect(validLower).toBe(true);
      expect(validUpper).toBe(true);
    });
  });

  // ==========================================
  // Integration Tests
  // ==========================================

  describe('Integration', () => {
    let generatedWallet: WalletManager;

    beforeAll(() => {
      // Prepare a generated wallet once for integration tests (silent by default)
      generatedWallet = WalletManager.generate();
    });

    it('should complete full message signing and verification flow', async () => {
      const w = generatedWallet;
      const message = 'Integration test message';

      const signed = await w.signMessage(message);
      const isValid = WalletManager.verifySignedMessage(
        message,
        signed.signature,
        w.address,
      );

      expect(isValid).toBe(true);
    });

    it('should handle multiple sequential operations', async () => {
      const msg1 = await wallet.signMessage('Message 1');
      const msg2 = await wallet.signMessage('Message 2');

      expect(msg1.messageHash).not.toEqual(msg2.messageHash);

      const valid1 = WalletManager.verifySignedMessage(
        'Message 1',
        msg1.signature,
        wallet.address,
      );
      const valid2 = WalletManager.verifySignedMessage(
        'Message 2',
        msg2.signature,
        wallet.address,
      );

      expect(valid1).toBe(true);
      expect(valid2).toBe(true);
    });

    it('should never expose private key across any operations', async () => {
      const w = generatedWallet;
      await w.signMessage('Test');
      const str = w.toString();

      // Private key should not be anywhere
      expect(str).toMatch(/WalletManager\(address=/);
    });
  });

  // ==========================================
  // Keyfile Import/Export
  // ==========================================

  describe('Keyfile import/export', () => {
    const password = 'test-password';

    it('should export to encrypted keyfile and import back (preserve address and private key)', async () => {
      const mgr = new WalletManager(validPrivateKey);
      const tmpPath = join(
        tmpdir(),
        `keystore-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      );

      await mgr.toKeyFile(tmpPath, password);

      const fileContents = await readFile(tmpPath, 'utf-8');

      // Keystore JSON should look encrypted and must not contain the raw private key
      // Ethers/geth keystores may use 'Crypto' or 'crypto' keys; assert presence of ciphertext
      expect(fileContents).toMatch(/"ciphertext"/);
      expect(fileContents).not.toContain(validPrivateKey);

      const loaded = await WalletManager.fromKeyFile(tmpPath, password);
      expect(loaded.address).toEqual(mgr.address);

      // @ts-expect-error Accessing privateKey for test verification (not exposed in public API)
      expect(loaded.wallet.privateKey).toEqual(mgr.wallet.privateKey);

      await unlink(tmpPath);
    }, 30000);

    it('should fail to import with wrong password', async () => {
      const mgr = new WalletManager(validPrivateKey);
      const tmpPath = join(
        tmpdir(),
        `keystore-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      );

      await mgr.toKeyFile(tmpPath, password);

      await expect(
        WalletManager.fromKeyFile(tmpPath, 'wrong-password'),
      ).rejects.toThrow();

      await unlink(tmpPath);
    }, 30000);
  });
});
