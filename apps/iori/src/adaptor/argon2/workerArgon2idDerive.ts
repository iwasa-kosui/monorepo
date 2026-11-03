import noSimdModule from 'argon2id/dist/no-simd.wasm';
import simdModule from 'argon2id/dist/simd.wasm';
import setupWasm from 'argon2id/lib/setup.js';

import type { Argon2idDerive } from '../../domain/password/argon2idDerive.ts';

const instantiate = (module: WebAssembly.Module, imports: WebAssembly.Imports) =>
  WebAssembly.instantiate(module, imports).then((instance) => ({ module, instance }));

let computeHash: ReturnType<typeof setupWasm> | undefined;

export const workerArgon2idDerive: Argon2idDerive = async (params) => {
  computeHash ??= setupWasm(
    (imports) => instantiate(simdModule, imports),
    (imports) => instantiate(noSimdModule, imports),
  );
  return (await computeHash)(params);
};
