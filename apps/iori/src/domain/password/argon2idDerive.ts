import { argon2id } from '@noble/hashes/argon2.js';

export type Argon2idDerive = (params: {
  password: Uint8Array;
  salt: Uint8Array;
  parallelism: number;
  passes: number;
  memorySize: number;
  tagLength: number;
}) => Promise<Uint8Array>;

export const nobleArgon2idDerive: Argon2idDerive = ({ password, salt, parallelism, passes, memorySize, tagLength }) =>
  Promise.resolve(argon2id(password, salt, {
    p: parallelism,
    dkLen: tagLength,
    m: memorySize,
    t: passes,
  }));
