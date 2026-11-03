import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

import { nobleArgon2idDerive } from '../../../domain/password/argon2idDerive.ts';
import { type Argon2idWasmKind, createArgon2idDerive } from '../createArgon2idDerive.ts';

const require = createRequire(import.meta.url);

const compileWasm = async (kind: Argon2idWasmKind) =>
  WebAssembly.compile(
    await readFile(require.resolve(kind === 'simd' ? 'argon2id/dist/simd.wasm' : 'argon2id/dist/no-simd.wasm')),
  );

const params = {
  password: new TextEncoder().encode('securepassword1234'),
  salt: new Uint8Array(16).fill(7),
  parallelism: 1,
  passes: 1,
  memorySize: 1024,
  tagLength: 32,
};

describe('createArgon2idDerive', () => {
  it('computes the same tag as @noble/hashes on every call', async () => {
    const derive = createArgon2idDerive({ loadModule: compileWasm });
    const expected = await nobleArgon2idDerive(params);

    const first = await derive(params);
    const second = await derive(params);

    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
  });

  it('loads each module at most once across calls', async () => {
    const loadModule = vi.fn(compileWasm);
    const derive = createArgon2idDerive({ loadModule });

    await derive(params);
    const loadedAfterFirstCall = loadModule.mock.calls.length;
    await derive(params);

    expect(loadModule.mock.calls.length).toBe(loadedAfterFirstCall);
  });

  it('succeeds on the next call after loading the modules failed', async () => {
    let failing = true;
    const loadModule = vi.fn(async (kind: Argon2idWasmKind) => {
      if (failing) {
        throw new Error('load failed');
      }
      return compileWasm(kind);
    });
    const derive = createArgon2idDerive({ loadModule });

    await expect(derive(params)).rejects.toThrow('load failed');
    failing = false;

    await expect(derive(params)).resolves.toEqual(await nobleArgon2idDerive(params));
  });

  it('succeeds on the next call after setup failed', async () => {
    const realSetup = (await import('argon2id/lib/setup.js')).default;
    const setup = vi.fn<typeof realSetup>()
      .mockRejectedValueOnce(new Error('setup failed'))
      .mockImplementation(realSetup);
    const derive = createArgon2idDerive({ loadModule: compileWasm, setup });

    await expect(derive(params)).rejects.toThrow('setup failed');

    await expect(derive(params)).resolves.toEqual(await nobleArgon2idDerive(params));
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it('sets up a new instance for every call', async () => {
    const realSetup = (await import('argon2id/lib/setup.js')).default;
    const setup = vi.fn<typeof realSetup>(realSetup);
    const derive = createArgon2idDerive({ loadModule: compileWasm, setup });

    await derive(params);
    await derive(params);

    expect(setup).toHaveBeenCalledTimes(2);
  });
});
