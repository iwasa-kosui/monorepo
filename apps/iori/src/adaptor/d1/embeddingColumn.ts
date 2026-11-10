import { customType } from 'drizzle-orm/sqlite-core';

import { bytesToFloat32, float32ToBytes } from '../../domain/interestSource/embeddingBytes.ts';

// D1 returns BLOB columns as number[], node:sqlite as Uint8Array.
const toFloat32Array = (value: ArrayBuffer | Uint8Array | number[]): Float32Array => bytesToFloat32(value);

export const embeddingBlob = customType<{ data: Float32Array; driverData: ArrayBuffer | Uint8Array | number[] }>({
  dataType: () => 'blob',
  toDriver: float32ToBytes,
  fromDriver: toFloat32Array,
});
