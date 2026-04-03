import { describe, expect, it } from 'vitest';

import { CanonicalSerializer } from '@/core/serializer';

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('CanonicalSerializer', () => {
  it('serializes nested objects with recursively sorted keys', () => {
    const input = {
      z: 1,
      a: {
        d: true,
        b: [
          { y: 2, x: 1 },
          { b: 2, a: 1 },
        ],
        c: null,
      },
    };

    const json = decode(CanonicalSerializer.serialize(input));

    expect(json).toBe(
      '{"a":{"b":[{"x":1,"y":2},{"a":1,"b":2}],"c":null,"d":true},"z":1}',
    );
  });

  it('preserves unicode strings including emoji and non-ascii chars', () => {
    const input = { message: 'hello', emoji: '🦊', cjk: '漢字' };
    const json = decode(CanonicalSerializer.serialize(input));

    expect(json).toBe('{"cjk":"漢字","emoji":"🦊","message":"hello"}');
  });

  it('rejects floating point numbers', () => {
    expect(() => CanonicalSerializer.serialize({ price: 0.1 })).toThrow(
      /floating point/i,
    );
  });

  it('rejects unsafe integers larger than javascript safe range', () => {
    expect(() =>
      CanonicalSerializer.serialize({ amount: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(/unsafe integers/i);
  });

  it('accepts bigint by converting to string to avoid precision loss', () => {
    const json = decode(
      CanonicalSerializer.serialize({ amount: 9007199254740993n }),
    );

    expect(json).toBe('{"amount":"9007199254740993"}');
  });

  it('handles null values and empty collections', () => {
    const json = decode(
      CanonicalSerializer.serialize({ emptyObj: {}, emptyArr: [], n: null }),
    );

    expect(json).toBe('{"emptyArr":[],"emptyObj":{},"n":null}');
  });

  it('is deterministic across 1000 iterations', () => {
    const input = {
      b: 2,
      a: { z: 'z', y: ['x', { c: 3, a: 1, b: 2 }] },
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
    };

    expect(CanonicalSerializer.verifyDeterminism(input, 1000)).toBe(true);
  });

  it('produces stable keccak hashes for equivalent objects', () => {
    const first = { b: 2, a: 1 };
    const second = { a: 1, b: 2 };

    const hashA = Buffer.from(CanonicalSerializer.hash(first)).toString('hex');
    const hashB = Buffer.from(CanonicalSerializer.hash(second)).toString('hex');

    expect(hashA).toBe(hashB);
  });

  it('rejects non-finite numbers (NaN and Infinity)', () => {
    expect(() => CanonicalSerializer.serialize({ x: Number.NaN })).toThrow(
      /non-finite numbers/i,
    );
    expect(() =>
      CanonicalSerializer.serialize({ x: Number.POSITIVE_INFINITY }),
    ).toThrow(/non-finite numbers/i);
    expect(() =>
      CanonicalSerializer.serialize({ x: Number.NEGATIVE_INFINITY }),
    ).toThrow(/non-finite numbers/i);
  });

  it('normalizes Date values to ISO 8601 UTC strings', () => {
    const json = decode(
      CanonicalSerializer.serialize({
        createdAt: new Date('2024-03-12T10:20:30Z'),
      }),
    );

    expect(json).toBe('{"createdAt":"2024-03-12T10:20:30.000Z"}');
  });

  it('strips undefined, function, and symbol fields from objects recursively', () => {
    const payload = {
      keep: 'ok',
      dropUndef: undefined,
      dropFn: () => 'nope',
      dropSym: Symbol('s'),
      nested: {
        a: 1,
        b: undefined,
        c: Symbol('nested'),
      },
    };

    const json = decode(CanonicalSerializer.serialize(payload));

    expect(json).toBe('{"keep":"ok","nested":{"a":1}}');
  });

  it('rejects unsupported top-level types', () => {
    expect(() =>
      CanonicalSerializer.serialize(undefined as unknown as object),
    ).toThrow(/unsupported type/i);
    expect(() =>
      CanonicalSerializer.serialize((() => 1) as unknown as object),
    ).toThrow(/unsupported type/i);
    expect(() =>
      CanonicalSerializer.serialize(Symbol('x') as unknown as object),
    ).toThrow(/unsupported type/i);
  });

  it('rejects arrays containing unsupported values', () => {
    expect(() => CanonicalSerializer.serialize([1, undefined, 2])).toThrow(
      /unsupported type/i,
    );
    expect(() =>
      CanonicalSerializer.serialize([1, Symbol('bad'), 2] as unknown[]),
    ).toThrow(/unsupported type/i);
  });

  it('returns true for verifyDeterminism when iterations is zero or negative', () => {
    const sample = { b: 2, a: 1 };

    expect(CanonicalSerializer.verifyDeterminism(sample, 0)).toBe(true);
    expect(CanonicalSerializer.verifyDeterminism(sample, -5)).toBe(true);
  });

  it('returns 32-byte keccak hash output', () => {
    const hash = CanonicalSerializer.hash({ a: 1 });

    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('is invariant to object insertion order across many randomized permutations', () => {
    const baseEntries: Array<[string, number | string | null | boolean]> = [
      ['alpha', 1],
      ['beta', 'two'],
      ['gamma', null],
      ['delta', true],
      ['epsilon', 5],
      ['zeta', false],
    ];

    const canonical = decode(
      CanonicalSerializer.serialize(Object.fromEntries(baseEntries)),
    );

    for (let i = 0; i < 50; i++) {
      const shuffled = [...baseEntries].sort(() => Math.random() - 0.5);
      const candidate = decode(
        CanonicalSerializer.serialize(Object.fromEntries(shuffled)),
      );
      expect(candidate).toBe(canonical);
    }
  });
});
