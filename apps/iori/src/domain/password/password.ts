import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Argon2idDerive } from './argon2idDerive.ts';

export const PasswordSym = Symbol('Password');
const zodType = z.string().min(16).max(255).brand(PasswordSym).describe('Password');
export type Password = z.output<typeof zodType>;
const schema = Schema.create<Password, string>(zodType);

const hashedPasswordZodType = z.object({
  algorithm: z.literal('argon2id'),
  parallelism: z.number(),
  tagLength: z.number(),
  memory: z.number(),
  passes: z.number(),
  nonceHex: z.string(),
  tagHex: z.string(),
}).describe('HashedPassword');
export type HashedPassword = z.infer<typeof hashedPasswordZodType>;
export const HashedPassword = Schema.create<HashedPassword, unknown>(hashedPasswordZodType);

type Argon2Config = Omit<HashedPassword, 'nonceHex' | 'tagHex'>;

const CONFIG = {
  parallelism: 4,
  tagLength: 64,
  memory: 65536,
  passes: 3,
  algorithm: 'argon2id',
} as const;

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const deriveHash = (derive: Argon2idDerive, password: Password, nonce: Uint8Array, config: Argon2Config) => {
  switch (config.algorithm) {
    case 'argon2id':
      return derive({
        password: new TextEncoder().encode(password),
        salt: nonce,
        parallelism: config.parallelism,
        passes: config.passes,
        memorySize: config.memory,
        tagLength: config.tagLength,
      });
    default: {
      const unsupported: never = config.algorithm;
      throw new Error(`Unsupported password algorithm: ${String(unsupported)}`);
    }
  }
};

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
};

const hashPassword = (derive: Argon2idDerive) => async (password: Password): Promise<HashedPassword> => {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const tag = await deriveHash(derive, password, nonce, CONFIG);
  return {
    algorithm: CONFIG.algorithm,
    parallelism: CONFIG.parallelism,
    tagLength: CONFIG.tagLength,
    memory: CONFIG.memory,
    passes: CONFIG.passes,
    nonceHex: toHex(nonce),
    tagHex: toHex(tag),
  };
};

const verifyPassword =
  (derive: Argon2idDerive) => async (stored: HashedPassword, password: Password): Promise<boolean> => {
    const nonce = fromHex(stored.nonceHex);
    const expected = fromHex(stored.tagHex);
    const actual = await deriveHash(derive, password, nonce, {
      algorithm: stored.algorithm,
      parallelism: stored.parallelism,
      tagLength: stored.tagLength,
      memory: stored.memory,
      passes: stored.passes,
    });
    return equalBytes(expected, actual);
  };

export const Password = {
  ...schema,
  hashPassword,
  verifyPassword,
} as const;
