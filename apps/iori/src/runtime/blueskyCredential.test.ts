import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { UserId } from '../domain/user/userId.ts';
import { type BlueskyRuntimeConfig, createBlueskyAccounts, resolveBlueskyRuntimeConfig } from './blueskyCredential.ts';

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

describe('createBlueskyAccounts', () => {
  const ENV = { identifier: 'kosui.me', appPassword: 'app-pass' };

  const setup = (config: BlueskyRuntimeConfig) => {
    const fixture = createSqliteD1Fixture();
    const seed = createMastodonSeed(fixture);
    const owner = UserId.orThrow(seed.addLocalActor('kosui').userId);
    const alice = UserId.orThrow(seed.addLocalActor('alice').userId);
    const bob = UserId.orThrow(seed.addLocalActor('bob').userId);
    const link = (userId: UserId, did: string) =>
      fixture.sqlite.prepare(
        'INSERT INTO bluesky_credentials(userId,identifier,did,handle,appPasswordCiphertext,appPasswordIv,keyVersion,chatPermitted,verifiedAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(userId, `${did}.example`, did, `${did}.example`, 'ciphertext', 'iv', 1, 1, 1, 1);
    return { accounts: createBlueskyAccounts(config, fixture.db), owner, alice, bob, link };
  };

  it('環境変数の資格情報はオーナーにだけ渡し、鍵はだれにでも渡す', async () => {
    const t = setup({ envCredentials: ENV, credentialKey: VALID_KEY });

    expect(await t.accounts.configFor(t.owner)).toEqual({
      userId: t.owner,
      envCredentials: ENV,
      credentialKey: VALID_KEY,
    });
    expect(await t.accounts.configFor(t.alice)).toEqual({
      userId: t.alice,
      envCredentials: undefined,
      credentialKey: VALID_KEY,
    });
  });

  it('オーナーは環境変数の資格情報でつながっているとみなし、ほかのユーザーは保存済みの資格情報があるときだけつながっている', async () => {
    const t = setup({ envCredentials: ENV, credentialKey: VALID_KEY });
    t.link(t.alice, 'did:plc:alice');

    expect(await t.accounts.isLinked(t.owner)).toBe(true);
    expect(await t.accounts.isLinked(t.alice)).toBe(true);
    expect(await t.accounts.isLinked(t.bob)).toBe(false);
  });

  it('linkedConfigs には、資格情報を保存したユーザーと環境変数の資格情報を持つオーナーが重複なく入る', async () => {
    const t = setup({ envCredentials: ENV, credentialKey: VALID_KEY });
    t.link(t.owner, 'did:plc:owner');
    t.link(t.alice, 'did:plc:alice');

    const configs = await t.accounts.linkedConfigs();

    expect([...configs].sort((a, b) => a.userId.localeCompare(b.userId))).toEqual(
      [
        { userId: t.owner, envCredentials: ENV, credentialKey: VALID_KEY },
        { userId: t.alice, envCredentials: undefined, credentialKey: VALID_KEY },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
  });

  it('環境変数の資格情報が無ければ、資格情報を保存していないオーナーは linkedConfigs に入らない', async () => {
    const t = setup({ envCredentials: undefined, credentialKey: VALID_KEY });
    t.link(t.alice, 'did:plc:alice');

    expect(await t.accounts.linkedConfigs()).toEqual([
      { userId: t.alice, envCredentials: undefined, credentialKey: VALID_KEY },
    ]);
    expect(await t.accounts.isLinked(t.owner)).toBe(false);
  });

  it('環境変数の資格情報があれば、資格情報を保存していないオーナーも linkedConfigs に入る', async () => {
    const t = setup({ envCredentials: ENV, credentialKey: undefined });

    expect(await t.accounts.linkedConfigs()).toEqual([
      { userId: t.owner, envCredentials: ENV, credentialKey: undefined },
    ]);
  });
});
