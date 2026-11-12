import { RA, Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAesGcmCipher } from '../adaptor/crypto/aesGcmCipher.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import {
  createD1BlueskyStoredCredentialResolver,
  createD1BlueskyStoredCredentialSavedStore,
} from '../adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import {
  createD1BlueskyLoginFailureDeletedStore,
  createD1BlueskyLoginFailureSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1UserPasswordResolver } from '../adaptor/d1/userPassword/userPasswordResolver.ts';
import { BLUESKY_CREDENTIAL_AAD } from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySession } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import { Password } from '../domain/password/password.ts';
import { UserId } from '../domain/user/userId.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyCredentialVerifier } from '../ports/blueskyCredentialVerifier.ts';
import { RegisterBlueskyCredentialUseCase } from './registerBlueskyCredential.ts';
import { VerifyCurrentPasswordUseCase } from './verifyCurrentPassword.ts';

const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const PASSWORD = 'correct-horse-battery';
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
const NOW = Instant.orThrow(1_800_000_000_000);

const fakeDerive: Argon2idDerive = async ({ password, salt, tagLength }) =>
  Uint8Array.from({ length: tagLength }, (_, index) => password[index % password.length]! ^ salt[index % salt.length]!);

const session = (overrides: Partial<BlueskySession> = {}): BlueskySession => ({
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  pdsUrl: 'https://pds.example',
  accessJwt: 'new-access',
  refreshJwt: 'new-refresh',
  updatedAt: NOW,
  ...overrides,
});

const loginError: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'auth',
  message: 'createSession failed: status 401',
  status: 401,
};

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = async (options: {
  key?: string | undefined;
  login?: BlueskyCredentialVerifier['login'];
  chat?: boolean | null;
} = {}) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite } = fixture;
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  const hashed = await Password.hashPassword(fakeDerive)(Password.orThrow(PASSWORD));
  sqlite.prepare(
    'INSERT INTO user_passwords(userId,algorithm,parallelism,tagLength,memory,passes,nonceHex,tagHex) VALUES (?,?,?,?,?,?,?,?)',
  ).run(
    USER_ID,
    hashed.algorithm,
    hashed.parallelism,
    hashed.tagLength,
    hashed.memory,
    hashed.passes,
    hashed.nonceHex,
    hashed.tagHex,
  );
  const verifier: BlueskyCredentialVerifier = {
    login: vi.fn(options.login ?? (async () => RA.ok(session()))),
    probeChat: vi.fn(async () => options.chat === undefined ? true : options.chat),
  };
  const cipher = createAesGcmCipher({ key: 'key' in options ? options.key : KEY, aad: BLUESKY_CREDENTIAL_AAD });
  const sessionResolver = createD1BlueskySessionResolver(db);
  const storedResolver = createD1BlueskyStoredCredentialResolver(db);
  const useCase = RegisterBlueskyCredentialUseCase.create({
    cipher,
    verifyCurrentPassword: VerifyCurrentPasswordUseCase.create({
      userPasswordResolver: createD1UserPasswordResolver(db),
      argon2idDerive: fakeDerive,
    }),
    verifier,
    storedResolver,
    savedStore: createD1BlueskyStoredCredentialSavedStore(db),
    sessionResolver,
    sessionSavedStore: createD1BlueskySessionSavedStore(db),
    loginFailureDeletedStore: createD1BlueskyLoginFailureDeletedStore(db, 'timeline'),
    now: () => NOW,
  });
  const input = {
    userId: USER_ID,
    identifier: 'alice.bsky.social',
    appPassword: 'abcd-efgh-ijkl-mnop',
    currentPassword: PASSWORD,
  };
  const credentialRows = () => sqlite.prepare('SELECT * FROM bluesky_credentials').all();
  const sessionRows = () => sqlite.prepare('SELECT * FROM bluesky_sessions').all();
  const seedSession = (did: string) =>
    createD1BlueskySessionSavedStore(db).save(session({ did, accessJwt: 'old-access', refreshJwt: 'old-refresh' }));
  const seedLoginFailure = () => createD1BlueskyLoginFailureSavedStore(db, 'timeline').save(NOW);
  const loginFailureRows = () => sqlite.prepare('SELECT * FROM bluesky_login_failures').all();
  return {
    useCase,
    input,
    verifier,
    credentialRows,
    sessionRows,
    seedSession,
    seedLoginFailure,
    loginFailureRows,
    storedResolver,
  };
};

describe('RegisterBlueskyCredentialUseCase', () => {
  it('鍵が無いときは何も呼ばず保存しない', async () => {
    const t = await setup({ key: undefined });

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyCredentialKeyMissing' } });
    expect(t.verifier.login).not.toHaveBeenCalled();
    expect(t.credentialRows()).toEqual([]);
  });

  it('iori のパスワードが違うと、Bluesky を呼ばず保存しない', async () => {
    const t = await setup();

    const result = await t.useCase.run({ ...t.input, currentPassword: 'wrong-password-value' });

    expect(result).toMatchObject({ ok: false, err: { type: 'InvalidCurrentPassword' } });
    expect(t.verifier.login).not.toHaveBeenCalled();
    expect(t.credentialRows()).toEqual([]);
  });

  it('16 文字に満たないパスワードも違うものとして扱う', async () => {
    const t = await setup();

    expect(await t.useCase.run({ ...t.input, currentPassword: 'short' })).toMatchObject({
      ok: false,
      err: { type: 'InvalidCurrentPassword' },
    });
  });

  it('Bluesky へのログインに失敗したら、何も保存しない', async () => {
    const t = await setup({ login: async () => RA.err(loginError) });
    await t.seedSession('did:plc:alice');
    await t.seedLoginFailure();

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyLoginFailed', cause: loginError } });
    expect(t.credentialRows()).toEqual([]);
    expect(t.sessionRows()).toMatchObject([{ accessJwt: 'old-access' }]);
    expect(t.loginFailureRows()).toHaveLength(1);
    expect(t.verifier.probeChat).not.toHaveBeenCalled();
  });

  it('いまのセッションと DID が違うときは 保存しない', async () => {
    const t = await setup();
    await t.seedSession('did:plc:someone-else');

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyDidMismatch' } });
    expect(t.credentialRows()).toEqual([]);
    expect(t.sessionRows()).toMatchObject([{ did: 'did:plc:someone-else', accessJwt: 'old-access' }]);
  });

  it('保存済みの資格情報があるときは、そちらの DID と比べる', async () => {
    const t = await setup();
    expect((await t.useCase.run(t.input)).ok).toBe(true);
    await t.seedSession('did:plc:someone-else');
    vi.mocked(t.verifier.login).mockResolvedValueOnce(Result.ok(session({ did: 'did:plc:bob' })));

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyDidMismatch' } });
  });

  it.each([
    [true, true],
    [false, false],
    [null, null],
  ])('DM の確認結果 %s を保存し、応答に載せる', async (probed, expected) => {
    const t = await setup({ chat: probed });

    const result = await t.useCase.run(t.input);

    expect(result).toEqual({
      ok: true,
      val: {
        source: 'settings',
        handle: 'alice.bsky.social',
        did: 'did:plc:alice',
        chatPermitted: expected,
        verifiedAt: NOW,
        registrable: true,
      },
    });
    const stored = await t.storedResolver.resolve();
    expect(stored.ok && stored.val?.chatPermitted).toBe(expected);
  });

  it('暗号化して保存し、セッションを上書きして、ログイン失敗の記録を消す', async () => {
    const t = await setup();
    await t.seedSession('did:plc:alice');
    await t.seedLoginFailure();

    const result = await t.useCase.run(t.input);

    expect(result.ok).toBe(true);
    const rows = t.credentialRows() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'default',
      identifier: 'alice.bsky.social',
      did: 'did:plc:alice',
      handle: 'alice.bsky.social',
      keyVersion: 1,
      chatPermitted: 1,
      verifiedAt: NOW,
      updatedAt: NOW,
    });
    expect(JSON.stringify(rows)).not.toContain('abcd-efgh-ijkl-mnop');
    const cipher = createAesGcmCipher({ key: KEY, aad: BLUESKY_CREDENTIAL_AAD })!;
    expect(
      await cipher.decrypt({
        ciphertext: rows[0]!.appPasswordCiphertext as string,
        iv: rows[0]!.appPasswordIv as string,
      }),
    ).toBe('abcd-efgh-ijkl-mnop');
    expect(t.sessionRows()).toMatchObject([{ id: 'default', accessJwt: 'new-access', refreshJwt: 'new-refresh' }]);
    expect(t.loginFailureRows()).toEqual([]);
  });

  it('識別子の前後の空白を取り除いてログインする', async () => {
    const t = await setup();

    await t.useCase.run({ ...t.input, identifier: '  alice.bsky.social ' });

    expect(t.verifier.login).toHaveBeenCalledWith({
      identifier: 'alice.bsky.social',
      appPassword: 'abcd-efgh-ijkl-mnop',
    });
  });
});
