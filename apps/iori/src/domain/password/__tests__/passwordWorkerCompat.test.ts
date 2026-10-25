import { argon2id } from '@noble/hashes/argon2.js';
import { argon2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Worker password compatibility', () => {
  it('matches the Node Argon2id hash format used by stored passwords', () => {
    const password = 'securepassword1234';
    const nonce = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const options = {
      parallelism: 4,
      tagLength: 64,
      memory: 65536,
      passes: 3,
    };

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
});
