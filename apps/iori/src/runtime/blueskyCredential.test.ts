import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveBlueskyRuntimeConfig } from './blueskyCredential.ts';

const VALID_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const envCredentials = { BLUESKY_IDENTIFIER: 'iori.example.com', BLUESKY_APP_PASSWORD: 'app-pass' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveBlueskyRuntimeConfig の鍵の警告', () => {
  it.each([
    ['base64 として不正な鍵', '%%%not base64%%%'],
    ['32 バイトに満たない鍵', btoa(String.fromCharCode(...new Uint8Array(31).fill(7)))],
    ['32 バイトを超える鍵', btoa(String.fromCharCode(...new Uint8Array(33).fill(7)))],
  ])('%s では、鍵の値を含めずに warn を 1 回出す', (_label, key) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = resolveBlueskyRuntimeConfig({ ...envCredentials, BLUESKY_CREDENTIAL_KEY: key });

    expect(config?.credentialKey).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ event: 'bluesky_credential_key_invalid' }));
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(key);
  });

  it.each([
    ['未設定', undefined],
    ['空文字', ''],
    ['空白だけ', '  \n'],
    ['有効な鍵', VALID_KEY],
  ])('%s では warn を出さない', (_label, key) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resolveBlueskyRuntimeConfig({ ...envCredentials, BLUESKY_CREDENTIAL_KEY: key });

    expect(warn).not.toHaveBeenCalled();
  });
});
