import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createAesGcmCipher } from '../adaptor/crypto/aesGcmCipher.ts';
import {
  BLUESKY_CREDENTIAL_AAD,
  BLUESKY_CREDENTIAL_KEY_VERSION,
  type BlueskyStoredCredential,
} from '../domain/blueskyCredential/blueskyCredential.ts';
import type { Instant } from '../domain/instant/instant.ts';
import { ResolveBlueskyCredentialUseCase } from './resolveBlueskyCredential.ts';

const keyOf = (fill: number): string => btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)));
const cipher = createAesGcmCipher({ key: keyOf(1), aad: BLUESKY_CREDENTIAL_AAD })!;
const envCredentials = { identifier: 'env.example.com', appPassword: 'env-app-password' };

const storedWith = async (appPassword: string, encryptedBy = cipher): Promise<BlueskyStoredCredential> => {
  const encrypted = await encryptedBy.encrypt(appPassword);
  return {
    identifier: 'stored.example.com',
    did: 'did:plc:stored',
    handle: 'stored.example.com',
    appPasswordCiphertext: encrypted.ciphertext,
    appPasswordIv: encrypted.iv,
    keyVersion: BLUESKY_CREDENTIAL_KEY_VERSION,
    chatPermitted: true,
    verifiedAt: 1_000 as Instant,
    updatedAt: 1_000 as Instant,
  };
};

const setup = (options: {
  stored?: BlueskyStoredCredential;
  cipher?: typeof cipher | undefined;
  env?: typeof envCredentials | undefined;
}) => {
  const resolve = vi.fn(() => RA.ok(options.stored));
  const onDecryptFailed = vi.fn();
  const useCase = ResolveBlueskyCredentialUseCase.create({
    storedResolver: { resolve },
    cipher: 'cipher' in options ? options.cipher : cipher,
    envCredentials: options.env,
    onDecryptFailed,
  });
  return { useCase, resolve, onDecryptFailed };
};

describe('ResolveBlueskyCredentialUseCase', () => {
  it('鍵があり、保存済みの行を復号できれば、それを優先する', async () => {
    const t = setup({ stored: await storedWith('stored-app-password'), env: envCredentials });

    const resolution = await t.useCase.run();

    expect(resolution.source).toBe('settings');
    expect(resolution.credentials).toEqual({ identifier: 'stored.example.com', appPassword: 'stored-app-password' });
    expect(t.onDecryptFailed).not.toHaveBeenCalled();
  });

  it('復号に失敗したら記録して env の資格情報に戻る', async () => {
    const other = createAesGcmCipher({ key: keyOf(2), aad: BLUESKY_CREDENTIAL_AAD })!;
    const t = setup({ stored: await storedWith('stored-app-password', other), env: envCredentials });

    const resolution = await t.useCase.run();

    expect(resolution).toEqual({ source: 'secret', credentials: envCredentials });
    expect(t.onDecryptFailed).toHaveBeenCalledTimes(1);
  });

  it('保存済みの行が無ければ env の資格情報を使う', async () => {
    const t = setup({ env: envCredentials });

    expect(await t.useCase.run()).toEqual({ source: 'secret', credentials: envCredentials });
    expect(t.onDecryptFailed).not.toHaveBeenCalled();
  });

  it('鍵が無ければ D1 を読まず env の資格情報を使う', async () => {
    const t = setup({ stored: await storedWith('stored-app-password'), cipher: undefined, env: envCredentials });

    expect(await t.useCase.run()).toEqual({ source: 'secret', credentials: envCredentials });
    expect(t.resolve).not.toHaveBeenCalled();
  });

  it('どちらも無ければ none を返す', async () => {
    const t = setup({});

    expect(await t.useCase.run()).toEqual({ source: 'none', credentials: undefined });
  });
});
