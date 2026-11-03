import { argon2id } from '@noble/hashes/argon2.js';
import { argon2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { nodeArgon2idDerive } from '../../../adaptor/argon2/nodeArgon2idDerive.ts';

const password = 'securepassword1234';
const nonce = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const options = {
  parallelism: 4,
  tagLength: 64,
  memory: 65536,
  passes: 3,
};

describe('Worker password compatibility', () => {
  it('matches the Node Argon2id hash format used by stored passwords', () => {
    const nodeHash = argon2Sync('argon2id', {
      message: password,
      nonce,
      ...options,
    });
    const workerHash = argon2id(password, nonce, {
      p: options.parallelism,
      dkLen: options.tagLength,
      m: options.memory,
      t: options.passes,
    });

    expect(Buffer.from(workerHash).toString('hex')).toBe(nodeHash.toString('hex'));
  });

  it('matches @noble/hashes and node:crypto with the WASM Argon2id', async () => {
    const expected = argon2Sync('argon2id', {
      message: password,
      nonce,
      ...options,
    });
    const nobleHash = argon2id(password, nonce, {
      p: options.parallelism,
      dkLen: options.tagLength,
      m: options.memory,
      t: options.passes,
    });
    const wasmHash = await nodeArgon2idDerive({
      password: new TextEncoder().encode(password),
      salt: new Uint8Array(nonce),
      parallelism: options.parallelism,
      passes: options.passes,
      memorySize: options.memory,
      tagLength: options.tagLength,
    });

    expect(Buffer.from(wasmHash).toString('hex')).toBe(expected.toString('hex'));
    expect(Buffer.from(wasmHash).toString('hex')).toBe(Buffer.from(nobleHash).toString('hex'));
  });
});
