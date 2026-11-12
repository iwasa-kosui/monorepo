import { RA } from '@iwasa-kosui/result';
import { env } from 'cloudflare:test';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAesGcmCipher } from '../src/adaptor/crypto/aesGcmCipher.ts';
import {
  createD1BlueskyStoredCredentialDeletedStore,
  createD1BlueskyStoredCredentialResolver,
  createD1BlueskyStoredCredentialSavedStore,
} from '../src/adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import {
  createD1BlueskyLoginFailureDeletedStore,
  createD1BlueskyLoginFailureResolver,
  createD1BlueskyLoginFailureSavedStore,
} from '../src/adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  createD1BlueskySessionDeletedStore,
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../src/adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1UserPasswordResolver } from '../src/adaptor/d1/userPassword/userPasswordResolver.ts';
import {
  BLUESKY_CREDENTIAL_AAD,
  type BlueskyStoredCredential,
} from '../src/domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySession } from '../src/domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import type { Argon2idDerive } from '../src/domain/password/argon2idDerive.ts';
import { Password } from '../src/domain/password/password.ts';
import { UserId } from '../src/domain/user/userId.ts';
import { RegisterBlueskyCredentialUseCase } from '../src/useCase/registerBlueskyCredential.ts';
import { VerifyCurrentPasswordUseCase } from '../src/useCase/verifyCurrentPassword.ts';

const db = createD1Db(env.DB);
const userId = UserId.orThrow(crypto.randomUUID());
const PASSWORD = 'correct-horse-battery';
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
const NOW = Instant.orThrow(1_800_000_000_000);

const fakeDerive: Argon2idDerive = async ({ password, salt, tagLength }) =>
  Uint8Array.from({ length: tagLength }, (_, index) => password[index % password.length]! ^ salt[index % salt.length]!);

const stored = (overrides: Partial<BlueskyStoredCredential> = {}): BlueskyStoredCredential => ({
  identifier: 'alice.bsky.social',
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  appPasswordCiphertext: 'Y2lwaGVy',
  appPasswordIv: 'aXY=',
  keyVersion: 1,
  chatPermitted: true,
  verifiedAt: Instant.orThrow(1_000),
  updatedAt: Instant.orThrow(1_000),
  ...overrides,
});

const session = (overrides: Partial<BlueskySession> = {}): BlueskySession => ({
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  pdsUrl: 'https://pds.example',
  accessJwt: 'new-access',
  refreshJwt: 'new-refresh',
  updatedAt: NOW,
  ...overrides,
});

const resolveStored = async () => {
  const resolved = await createD1BlueskyStoredCredentialResolver(db).resolve();
  if (!resolved.ok) throw new Error('unreachable');
  return resolved.val;
};

const resolveSession = async () => {
  const resolved = await createD1BlueskySessionResolver(db).resolve();
  if (!resolved.ok) throw new Error('unreachable');
  return resolved.val;
};

const resetTables = () =>
  env.DB.batch([
    env.DB.prepare('DELETE FROM bluesky_credentials'),
    env.DB.prepare('DELETE FROM bluesky_sessions'),
    env.DB.prepare('DELETE FROM bluesky_login_failures'),
  ]);

beforeEach(resetTables);

afterAll(async () => {
  await resetTables();
  await env.DB.prepare('DELETE FROM user_passwords WHERE userId = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM users WHERE userId = ?').bind(userId).run();
});

describe('bluesky_credentials on workerd D1', () => {
  it('行が無ければ undefined を返す', async () => {
    expect(await resolveStored()).toBeUndefined();
  });

  it('保存した行を読み出せる（chatPermitted の true / false / null も往復する）', async () => {
    const savedStore = createD1BlueskyStoredCredentialSavedStore(db);

    for (const chatPermitted of [true, false, null]) {
      await savedStore.save(stored({ chatPermitted }));
      expect(await resolveStored()).toEqual(stored({ chatPermitted }));
    }
  });

  it('2 回目の保存は同じ行を更新し、行を増やさない', async () => {
    const savedStore = createD1BlueskyStoredCredentialSavedStore(db);
    await savedStore.save(stored());

    await savedStore.save(
      stored({ identifier: 'bob.bsky.social', did: 'did:plc:bob', updatedAt: Instant.orThrow(2_000) }),
    );

    expect(await resolveStored()).toMatchObject({
      identifier: 'bob.bsky.social',
      did: 'did:plc:bob',
      updatedAt: 2_000,
    });
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM bluesky_credentials').first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('削除すると読み出せなくなる', async () => {
    await createD1BlueskyStoredCredentialSavedStore(db).save(stored());

    await createD1BlueskyStoredCredentialDeletedStore(db).delete();

    expect(await resolveStored()).toBeUndefined();
  });

  it('セッションの削除は、保存済みのセッションだけを消す', async () => {
    await createD1BlueskySessionSavedStore(db).save(session());

    await createD1BlueskySessionDeletedStore(db).delete();

    expect(await resolveSession()).toBeUndefined();
  });
});

describe('アプリパスワードの登録', () => {
  const register = async (
    login: Parameters<typeof RegisterBlueskyCredentialUseCase.create>[0]['verifier']['login'],
  ) => {
    const hashed = await Password.hashPassword(fakeDerive)(Password.orThrow(PASSWORD));
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO users(userId,username) VALUES (?,?)').bind(
        userId,
        'bluesky-credential-user',
      ),
      env.DB.prepare('DELETE FROM user_passwords WHERE userId = ?').bind(userId),
      env.DB.prepare(
        'INSERT INTO user_passwords(userId,algorithm,parallelism,tagLength,memory,passes,nonceHex,tagHex) VALUES (?,?,?,?,?,?,?,?)',
      ).bind(
        userId,
        hashed.algorithm,
        hashed.parallelism,
        hashed.tagLength,
        hashed.memory,
        hashed.passes,
        hashed.nonceHex,
        hashed.tagHex,
      ),
    ]);
    const cipher = createAesGcmCipher({ key: KEY, aad: BLUESKY_CREDENTIAL_AAD });
    return {
      cipher,
      useCase: RegisterBlueskyCredentialUseCase.create({
        cipher,
        verifyCurrentPassword: VerifyCurrentPasswordUseCase.create({
          userPasswordResolver: createD1UserPasswordResolver(db),
          argon2idDerive: fakeDerive,
        }),
        verifier: { login, probeChat: async () => false },
        storedResolver: createD1BlueskyStoredCredentialResolver(db),
        savedStore: createD1BlueskyStoredCredentialSavedStore(db),
        sessionResolver: createD1BlueskySessionResolver(db),
        sessionSavedStore: createD1BlueskySessionSavedStore(db),
        loginFailureDeletedStore: createD1BlueskyLoginFailureDeletedStore(db, 'timeline'),
        now: () => NOW,
      }),
    };
  };
  const input = {
    userId,
    identifier: 'alice.bsky.social',
    appPassword: 'abcd-efgh-ijkl-mnop',
    currentPassword: PASSWORD,
  };

  it('成功すると、暗号化した行を保存し、bluesky_sessions を上書きし、bluesky_login_failures を消す', async () => {
    await createD1BlueskySessionSavedStore(db).save(session({ accessJwt: 'old-access', refreshJwt: 'old-refresh' }));
    await createD1BlueskyLoginFailureSavedStore(db, 'timeline').save(NOW);
    const { cipher, useCase } = await register(vi.fn(async () => RA.ok(session())));

    const result = await useCase.run(input);

    expect(result).toMatchObject({ ok: true, val: { source: 'settings', chatPermitted: false } });
    const row = await resolveStored();
    expect(row).toMatchObject({ identifier: 'alice.bsky.social', did: 'did:plc:alice', chatPermitted: false });
    expect(row?.appPasswordCiphertext).not.toContain('abcd');
    expect(await cipher!.decrypt({ ciphertext: row!.appPasswordCiphertext, iv: row!.appPasswordIv })).toBe(
      'abcd-efgh-ijkl-mnop',
    );
    expect(await resolveSession()).toMatchObject({ accessJwt: 'new-access', refreshJwt: 'new-refresh' });
    const failed = await createD1BlueskyLoginFailureResolver(db, 'timeline').resolve();
    expect(failed).toEqual({ ok: true, val: undefined });
  });

  it('ログインに失敗したら、何も保存せず bluesky_sessions も変えない', async () => {
    await createD1BlueskySessionSavedStore(db).save(session({ accessJwt: 'old-access' }));
    const { useCase } = await register(
      vi.fn(async () =>
        RA.err({
          type: 'BlueskyClientError' as const,
          kind: 'auth' as const,
          message: 'createSession failed: status 401',
        })
      ),
    );

    const result = await useCase.run(input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyLoginFailed' } });
    expect(await resolveStored()).toBeUndefined();
    expect(await resolveSession()).toMatchObject({ accessJwt: 'old-access' });
  });
});
