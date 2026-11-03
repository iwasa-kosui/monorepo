import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { createArgon2idDerive } from './createArgon2idDerive.ts';

const require = createRequire(import.meta.url);

const compileWasm = async (specifier: string) => WebAssembly.compile(await readFile(require.resolve(specifier)));

export const nodeArgon2idDerive = createArgon2idDerive({
  loadModule: (kind) => compileWasm(kind === 'simd' ? 'argon2id/dist/simd.wasm' : 'argon2id/dist/no-simd.wasm'),
});
