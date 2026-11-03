import setupWasm from 'argon2id/lib/setup.js';

import type { Argon2idDerive } from '../../domain/password/argon2idDerive.ts';

export type Argon2idWasmKind = 'simd' | 'noSimd';

type Deps = Readonly<{
  loadModule: (kind: Argon2idWasmKind) => Promise<WebAssembly.Module>;
  setup?: typeof setupWasm;
}>;

export const createArgon2idDerive = ({ loadModule, setup = setupWasm }: Deps): Argon2idDerive => {
  const modules: Partial<Record<Argon2idWasmKind, Promise<WebAssembly.Module>>> = {};
  let simdSupported: boolean | undefined;

  const getModule = (kind: Argon2idWasmKind) =>
    modules[kind] ??= loadModule(kind).catch((e) => {
      modules[kind] = undefined;
      throw e;
    });

  const instantiate = (kind: Argon2idWasmKind, imports: WebAssembly.Imports) =>
    getModule(kind).then((module) =>
      WebAssembly.instantiate(module, imports).then((instance) => ({ module, instance }))
    );

  const instantiateSimd = (imports: WebAssembly.Imports) =>
    instantiate('simd', imports).then((loaded) => {
      simdSupported = true;
      return loaded;
    });

  const instantiateNoSimd = (imports: WebAssembly.Imports) =>
    instantiate('noSimd', imports).then((loaded) => {
      simdSupported = false;
      return loaded;
    });

  const setupForSimdSupport = () => {
    switch (simdSupported) {
      case undefined:
        return setup(instantiateSimd, instantiateNoSimd);
      case true:
        return setup(instantiateSimd, instantiateSimd);
      case false:
        return setup(instantiateNoSimd, instantiateNoSimd);
    }
  };

  return async (params) => {
    const computeHash = await setupForSimdSupport();
    return computeHash(params);
  };
};
