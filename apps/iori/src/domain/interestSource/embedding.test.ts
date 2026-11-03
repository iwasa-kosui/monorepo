import { describe, expect, it } from 'vitest';

import { Embedding, EMBEDDING_DIMENSIONS } from './embedding.ts';

const sample = () => Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => Math.sin(index) * 3.5);

describe('Embedding', () => {
  it('encode は 1024 次元を 4096 バイトのリトルエンディアンにする', () => {
    const encoded = Embedding.encode(Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i === 0 ? 1 : 0));

    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.val).toHaveLength(4096);
    expect(Array.from(encoded.val.slice(0, 4))).toEqual([0x00, 0x00, 0x80, 0x3f]);
  });

  it('encode と decode は往復で元の値に戻る', () => {
    const original = sample();
    const encoded = Embedding.encode(original);
    if (!encoded.ok) throw new Error('unexpected');

    const fromBytes = Embedding.decode(encoded.val);
    const fromArray = Embedding.decode(Array.from(encoded.val));
    const fromBuffer = Embedding.decode(encoded.val.buffer as ArrayBuffer);

    for (const decoded of [fromBytes, fromArray, fromBuffer]) {
      expect(decoded.ok).toBe(true);
      if (decoded.ok) expect(Array.from(decoded.val)).toEqual(Array.from(original));
    }
  });

  it('1024 次元でないベクトルは encode と validate が err を返す', () => {
    const tooShort = new Float32Array(EMBEDDING_DIMENSIONS - 1);

    for (const result of [Embedding.encode(tooShort), Embedding.validate(tooShort)]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.err).toMatchObject({
          type: 'EmbeddingDimensionsError',
          detail: { expected: EMBEDDING_DIMENSIONS, actual: EMBEDDING_DIMENSIONS - 1 },
        });
      }
    }
    expect(Embedding.validate(new Float32Array(EMBEDDING_DIMENSIONS + 1)).ok).toBe(false);
  });

  it('4096 バイトでないバイト列は decode が err を返す', () => {
    expect(Embedding.decode(new Uint8Array(4095)).ok).toBe(false);
    expect(Embedding.decode(new Uint8Array(4100)).ok).toBe(false);
    expect(Embedding.decode([]).ok).toBe(false);
  });
});
