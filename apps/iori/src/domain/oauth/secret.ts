import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const SecretHashSym = Symbol('SecretHash');
const secretHashZodType = z.string().regex(/^[0-9a-f]{64}$/).brand(SecretHashSym).describe('SecretHash');
export type SecretHash = z.output<typeof secretHashZodType>;
export const SecretHash = Schema.create<SecretHash, string>(secretHashZodType);

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

const sha256 = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

const generate = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

const hash = async (plain: string): Promise<SecretHash> =>
  SecretHash.orThrow(Array.from(await sha256(plain), (byte) => byte.toString(16).padStart(2, '0')).join(''));

const timingSafeEqual = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return difference === 0;
};

const matches = async (plain: string, expected: SecretHash): Promise<boolean> =>
  timingSafeEqual(await hash(plain), expected);

export const Secret = {
  generate,
  hash,
  matches,
  timingSafeEqual,
  toBase64Url,
  sha256,
} as const;
