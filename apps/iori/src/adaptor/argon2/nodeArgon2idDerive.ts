import setupWasm from 'argon2id/lib/setup.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { Argon2idDerive } from '../../domain/password/argon2idDerive.ts';

const require = createRequire(import.meta.url);

const loadWasm = (specifier: string) => {
  const bytes = readFileSync(require.resolve(specifier));
  return (imports: WebAssembly.Imports) => WebAssembly.instantiate(bytes, imports);
};

let computeHash: ReturnType<typeof setupWasm> | undefined;

export const nodeArgon2idDerive: Argon2idDerive = async (params) => {
  computeHash ??= setupWasm(loadWasm('argon2id/dist/simd.wasm'), loadWasm('argon2id/dist/no-simd.wasm'));
  return (await computeHash)(params);
};
