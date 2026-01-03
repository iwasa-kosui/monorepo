import { z } from "zod/v4";
import { Schema } from "../../helper/schema.ts";
import { argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

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

const CONFIG = {
  parallelism: 4,
  tagLength: 64,
  memory: 65536,
  passes: 3,
  algorithm: 'argon2id',
} as const;

const hashPassword = (password: Password) => {
  const nonce = randomBytes(16);
  const tag = argon2Sync(
    CONFIG.algorithm,
    {
      message: password,
      nonce,
      parallelism: CONFIG.parallelism,
      tagLength: CONFIG.tagLength,
      memory: CONFIG.memory,
      passes: CONFIG.passes,
    });
  return {
    algorithm: CONFIG.algorithm,
    parallelism: CONFIG.parallelism,
    tagLength: CONFIG.tagLength,
    memory: CONFIG.memory,
    passes: CONFIG.passes,
    nonceHex: nonce.toString('hex'),
    tagHex: tag.toString('hex'),
  };
}

const verifyPassword = (stored: HashedPassword, password: Password) => {
  const nonce = Buffer.from(stored.nonceHex, 'hex');
  const expected = Buffer.from(stored.tagHex, 'hex');
  const actual = argon2Sync(stored.algorithm, {
    message: password,
    nonce,
    parallelism: stored.parallelism,
    tagLength: stored.tagLength,
    memory: stored.memory,
    passes: stored.passes,
  });
  return timingSafeEqual(expected, actual);
}


export const Password = {
  ...schema,
  hashPassword,
  verifyPassword,
} as const;
