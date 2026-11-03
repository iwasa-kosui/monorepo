import noSimdModule from 'argon2id/dist/no-simd.wasm';
import simdModule from 'argon2id/dist/simd.wasm';

import { createArgon2idDerive } from './createArgon2idDerive.ts';

export const workerArgon2idDerive = createArgon2idDerive({
  loadModule: (kind) => Promise.resolve(kind === 'simd' ? simdModule : noSimdModule),
});
