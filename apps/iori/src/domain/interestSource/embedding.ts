import { err, ok, type Result } from '@iwasa-kosui/result';

import { bytesToFloat32, float32ToBytes } from './embeddingBytes.ts';

export const EMBEDDING_DIMENSIONS = 1024;
const BYTES_PER_DIMENSION = 4;

export type EmbeddingDimensionsError = Readonly<{
  type: 'EmbeddingDimensionsError';
  message: string;
  detail: {
    expected: number;
    actual: number;
  };
}>;

export const EmbeddingDimensionsError = {
  create: ({ expected, actual }: { expected: number; actual: number }): EmbeddingDimensionsError => ({
    type: 'EmbeddingDimensionsError',
    message: `The embedding must have ${expected} dimensions, but got ${actual}.`,
    detail: { expected, actual },
  }),
} as const;

const validate = (embedding: Float32Array): Result<Float32Array, EmbeddingDimensionsError> =>
  embedding.length === EMBEDDING_DIMENSIONS
    ? ok(embedding)
    : err(EmbeddingDimensionsError.create({ expected: EMBEDDING_DIMENSIONS, actual: embedding.length }));

const encode = (embedding: Float32Array): Result<Uint8Array, EmbeddingDimensionsError> => {
  const validated = validate(embedding);
  return validated.ok ? ok(float32ToBytes(validated.val)) : validated;
};

const decode = (input: ArrayBuffer | ArrayLike<number>): Result<Float32Array, EmbeddingDimensionsError> => {
  const byteLength = input instanceof ArrayBuffer ? input.byteLength : input.length;
  return byteLength === EMBEDDING_DIMENSIONS * BYTES_PER_DIMENSION
    ? ok(bytesToFloat32(input))
    : err(
      EmbeddingDimensionsError.create({ expected: EMBEDDING_DIMENSIONS, actual: byteLength / BYTES_PER_DIMENSION }),
    );
};

export const Embedding = {
  validate,
  encode,
  decode,
} as const;
