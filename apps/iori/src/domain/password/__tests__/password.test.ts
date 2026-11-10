import { describe, expect, it } from 'vitest';

import { nodeArgon2idDerive } from '../../../adaptor/argon2/nodeArgon2idDerive.ts';
import { nobleArgon2idDerive } from '../argon2idDerive.ts';
import { type HashedPassword, Password } from '../password.ts';

describe('Password', () => {
  const password = Password.orThrow('securepassword1234');
  const wrongPassword = Password.orThrow('anotherpassword5678');

  it('verifies a hash created with @noble/hashes using the WASM Argon2id', async () => {
    const hashed = await Password.hashPassword(nobleArgon2idDerive)(password);

    await expect(Password.verifyPassword(nodeArgon2idDerive)(hashed, password)).resolves.toBe(true);
  }, 30_000);

  it('verifies a hash created with the WASM Argon2id using @noble/hashes', async () => {
    const hashed = await Password.hashPassword(nodeArgon2idDerive)(password);

    await expect(Password.verifyPassword(nobleArgon2idDerive)(hashed, password)).resolves.toBe(true);
  }, 30_000);

  it('rejects a wrong password', async () => {
    const hashed = await Password.hashPassword(nodeArgon2idDerive)(password);

    await expect(Password.verifyPassword(nodeArgon2idDerive)(hashed, wrongPassword)).resolves.toBe(false);
  }, 30_000);

  it('verifies a hash using the parameters stored with it', async () => {
    const config = { parallelism: 1, tagLength: 32, memory: 1024, passes: 1 };
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const tag = await nobleArgon2idDerive({
      password: new TextEncoder().encode(password),
      salt: nonce,
      parallelism: config.parallelism,
      passes: config.passes,
      memorySize: config.memory,
      tagLength: config.tagLength,
    });
    const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const hashed: HashedPassword = { algorithm: 'argon2id', ...config, nonceHex: toHex(nonce), tagHex: toHex(tag) };

    await expect(Password.verifyPassword(nodeArgon2idDerive)(hashed, password)).resolves.toBe(true);
    await expect(Password.verifyPassword(nodeArgon2idDerive)(hashed, wrongPassword)).resolves.toBe(false);
  });
});
