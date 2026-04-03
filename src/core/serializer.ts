import { getBytes, keccak256 } from 'ethers';

import { CanonicalSerializerError } from '@/core/errors';

type CanonicalPrimitive = string | number | boolean | null;
type CanonicalValue = CanonicalPrimitive | CanonicalValue[] | CanonicalObject;
type CanonicalObject = { [key: string]: CanonicalValue };

/**
 * Produces deterministic JSON for signing.
 *
 * Rules:
 * - Keys sorted alphabetically (recursive)
 * - No whitespace
 * - Numbers as-is (but prefer string amounts in trading data)
 * - Consistent unicode handling
 */
export class CanonicalSerializer {
  /**
   * Returns canonical bytes representation.
   * @param obj The object to serialize
   */
  public static serialize(obj: unknown): Uint8Array {
    const normalized = this.normalizeValue(obj);

    // JSON.stringify without space arguments guarantees no whitespace padding
    const jsonString = JSON.stringify(normalized);

    // Convert the deterministic string to UTF-8 bytes
    return new TextEncoder().encode(jsonString);
  }

  /**
   * Returns keccak256 of canonical serialization.
   * @param obj The object to hash
   */
  public static hash(obj: unknown): Uint8Array {
    const bytes = this.serialize(obj);

    // ethers v6 keccak256 returns a hex string.
    // We convert it back to a raw Uint8Array as required by the interface.
    return getBytes(keccak256(bytes));
  }

  /**
   * Verifies serialization is deterministic over N iterations.
   * @param obj The object to test
   * @param iterations Number of iterations to run (default: 100)
   */
  public static verifyDeterminism(
    obj: unknown,
    iterations: number = 100,
  ): boolean {
    if (iterations <= 0) return true;

    const firstRun = this.serialize(obj);
    // Convert to hex hash for easy string comparison
    const firstHash = keccak256(firstRun);

    for (let i = 1; i < iterations; i++) {
      const currentRun = this.serialize(obj);
      if (keccak256(currentRun) !== firstHash) {
        return false;
      }
    }

    return true;
  }

  /**
   * Normalizes the object into a strict canonical format by sorting keys
   * recursively and ensuring only valid JSON types are included.
   *
   * Accepts primitive JSON values, arrays, objects, Date, and bigint (which
   * will be converted to string). Floating point numbers, NaN, and Infinity
   * are rejected to avoid non-determinism.
   *
   * @param value - Any input value to normalize.
   * @returns The normalized canonical value tree ready for JSON serialization.
   * @throws {CanonicalSerializerError} for unsupported types or unsafe numbers.
   */
  private static normalizeValue(value: unknown): CanonicalValue {
    // Base case: null
    if (value === null) {
      return null;
    }

    // Base cases: standard JSON primitives
    if (typeof value === 'boolean' || typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new CanonicalSerializerError(
          'Canonical serialization rejects non-finite numbers.',
        );
      }

      if (!Number.isInteger(value)) {
        throw new CanonicalSerializerError(
          'Canonical serialization rejects floating point numbers. Use string or integer units.',
        );
      }

      if (!Number.isSafeInteger(value)) {
        throw new CanonicalSerializerError(
          'Canonical serialization rejects unsafe integers. Use bigint or string.',
        );
      }

      return value;
    }

    // Web3 safety: BigInts cannot be JSON serialized natively.
    // Trading systems generally pass amounts as strings to avoid precision loss.
    if (typeof value === 'bigint') {
      return value.toString();
    }

    // Handle Arrays (preserve order, but normalize elements recursively)
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeValue(item)) as CanonicalValue[];
    }

    // Handle Objects
    if (typeof value === 'object') {
      // Normalize Dates to ISO strings (consistent UTC representation)
      if (value instanceof Date) {
        return value.toISOString();
      }

      // In JS, Object.keys() is not guaranteed to be strictly alphabetical,
      // so we extract the keys and sort them using the default UTF-16 code unit order
      // which fulfills the Canonical JSON key sorting requirement.
      const sortedKeys = Object.keys(value).sort();
      const normalizedObj: CanonicalObject = {};

      for (const key of sortedKeys) {
        const val = (value as Record<string, unknown>)[key];

        // Standard JSON stringification natively ignores undefined, functions, and symbols.
        // We strip them out during normalization to maintain a pure CanonicalValue tree.
        if (
          val !== undefined &&
          typeof val !== 'function' &&
          typeof val !== 'symbol'
        ) {
          normalizedObj[key] = this.normalizeValue(val);
        }
      }

      return normalizedObj;
    }

    throw new CanonicalSerializerError(
      `Unsupported type for canonical serialization: typeof ${typeof value}`,
    );
  }
}
