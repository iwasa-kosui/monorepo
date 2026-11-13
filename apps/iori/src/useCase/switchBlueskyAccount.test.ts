import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAesGcmCipherFactory } from '../adaptor/crypto/aesGcmCipher.ts';
import { insertBlueskyAccountSwitch } from '../adaptor/d1/__tests__/blueskyAccountSwitchFixture.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyAccountSwitchResolver } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchResolver.ts';
import { createD1BlueskyAccountSwitchStartedStore } from '../adaptor/d1/blueskyAccountSwitch/blueskyAccountSwitchStartedStore.ts';
import {
  createD1BlueskyStoredCredentialResolver,
  createD1BlueskyStoredCredentialSavedStore,
} from '../adaptor/d1/blueskyCredential/blueskyCredentialStore.ts';
import { createD1BlueskyLoginFailureSavedStore } from '../adaptor/d1/blueskyCrosspost/blueskyLoginFailureStore.ts';
import {
  createD1BlueskySessionResolver,
  createD1BlueskySessionSavedStore,
} from '../adaptor/d1/blueskyCrosspost/blueskySessionStore.ts';
import { createD1UserPasswordResolver } from '../adaptor/d1/userPassword/userPasswordResolver.ts';
import { blueskyCredentialAad } from '../domain/blueskyCredential/blueskyCredential.ts';
import type { BlueskySession } from '../domain/blueskyCrosspost/blueskyCrosspost.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Argon2idDerive } from '../domain/password/argon2idDerive.ts';
import { Password } from '../domain/password/password.ts';
import { UserId } from '../domain/user/userId.ts';
import type { BlueskyClientError, BlueskyCredentials } from '../ports/blueskyClient.ts';
import type { BlueskyCredentialVerifier } from '../ports/blueskyCredentialVerifier.ts';
import { SwitchBlueskyAccountUseCase } from './switchBlueskyAccount.ts';
import { VerifyCurrentPasswordUseCase } from './verifyCurrentPassword.ts';

const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const PASSWORD = 'correct-horse-battery';
const APP_PASSWORD = 'abcd-efgh-ijkl-mnop';
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
const NOW = Instant.orThrow(1_800_000_000_000);

const fakeDerive: Argon2idDerive = async ({ password, salt, tagLength }) =>
  Uint8Array.from({ length: tagLength }, (_, index) => password[index % password.length]! ^ salt[index % salt.length]!);

const session = (overrides: Partial<BlueskySession> = {}): BlueskySession => ({
  did: 'did:plc:next',
  handle: 'next.bsky.social',
  pdsUrl: 'https://pds.example',
  accessJwt: 'new-access',
  refreshJwt: 'new-refresh',
  updatedAt: NOW,
  ...overrides,
});

const ENV_CREDENTIALS: BlueskyCredentials = { identifier: 'env.example.com', appPassword: 'env-app-password' };

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
  env?: BlueskyCredentials;
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
    logout: vi.fn(async () => undefined),
  };
  const useCase = SwitchBlueskyAccountUseCase.create({
    cipherFor: createAesGcmCipherFactory({ key: 'key' in options ? options.key : KEY, aadOf: blueskyCredentialAad }),
    envCredentials: options.env,
    verifyCurrentPassword: VerifyCurrentPasswordUseCase.create({
      userPasswordResolver: createD1UserPasswordResolver(db),
      argon2idDerive: fakeDerive,
    }),
    verifier,
    storedResolver: createD1BlueskyStoredCredentialResolver(db),
    sessionResolver: createD1BlueskySessionResolver(db),
    accountSwitchResolver: createD1BlueskyAccountSwitchResolver(db),
    startedStore: createD1BlueskyAccountSwitchStartedStore(db, 'timeline'),
    now: () => NOW,
  });
  const input = {
    userId: USER_ID,
    identifier: 'next.bsky.social',
    appPassword: APP_PASSWORD,
    currentPassword: PASSWORD,
    fromDid: 'did:plc:prev',
    toDid: 'did:plc:next',
  };
  const seedPrevious = async () => {
    await createD1BlueskyStoredCredentialSavedStore(db).save({
      identifier: 'prev.bsky.social',
      did: 'did:plc:prev',
      handle: 'prev.bsky.social',
      appPasswordCiphertext: 'Y2lwaGVy',
      appPasswordIv: 'aXY=',
      keyVersion: 1,
      chatPermitted: true,
      verifiedAt: Instant.orThrow(1_000),
      updatedAt: Instant.orThrow(1_000),
    });
    await createD1BlueskySessionSavedStore(db).save(
      session({ did: 'did:plc:prev', handle: 'prev.bsky.social', accessJwt: 'old-access', refreshJwt: 'old-refresh' }),
    );
    await createD1BlueskyLoginFailureSavedStore(db, 'timeline').save(NOW);
  };
  const snapshot = () => ({
    credentials: sqlite.prepare('SELECT * FROM bluesky_credentials').all(),
    sessions: sqlite.prepare('SELECT * FROM bluesky_sessions').all(),
    loginFailures: sqlite.prepare('SELECT * FROM bluesky_login_failures').all(),
    switches: sqlite.prepare('SELECT * FROM bluesky_account_switch').all(),
    events: sqlite.prepare('SELECT * FROM domain_events').all(),
  });
  return { useCase, input, verifier, seedPrevious, snapshot, sqlite };
};

describe('SwitchBlueskyAccountUseCase の失敗では何も変わらない', () => {
  it('鍵が無いときは、Bluesky を呼ばない', async () => {
    const t = await setup({ key: undefined });
    await t.seedPrevious();
    const before = t.snapshot();

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyCredentialKeyMissing' } });
    expect(t.verifier.login).not.toHaveBeenCalled();
    expect(t.snapshot()).toEqual(before);
  });

  it('iori のパスワードが違うときは、Bluesky を呼ばない', async () => {
    const t = await setup();
    await t.seedPrevious();
    const before = t.snapshot();

    const result = await t.useCase.run({ ...t.input, currentPassword: 'wrong-password-value' });

    expect(result).toMatchObject({ ok: false, err: { type: 'InvalidCurrentPassword' } });
    expect(t.verifier.login).not.toHaveBeenCalled();
    expect(t.snapshot()).toEqual(before);
  });

  it('Bluesky へのログインに失敗したとき', async () => {
    const t = await setup({ login: async () => RA.err(loginError) });
    await t.seedPrevious();
    const before = t.snapshot();

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyLoginFailed', cause: loginError } });
    expect(t.verifier.probeChat).not.toHaveBeenCalled();
    expect(t.snapshot()).toEqual(before);
  });

  it('fromDid がいまの DID と違うときは DidChanged にし、新しいセッションを logout する', async () => {
    const t = await setup();
    await t.seedPrevious();
    const before = t.snapshot();

    const result = await t.useCase.run({ ...t.input, fromDid: 'did:plc:someone-else' });

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyDidChanged' } });
    expect(t.verifier.logout).toHaveBeenCalledWith(session());
    expect(t.snapshot()).toEqual(before);
  });

  it('toDid がログインで得た DID と違うときは DidChanged にする', async () => {
    const t = await setup();
    await t.seedPrevious();
    const before = t.snapshot();

    const result = await t.useCase.run({ ...t.input, toDid: 'did:plc:another' });

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyDidChanged' } });
    expect(t.verifier.logout).toHaveBeenCalledWith(session());
    expect(t.snapshot()).toEqual(before);
  });

  it('いまと同じアカウントへの切り替えは DidChanged にする', async () => {
    const t = await setup({ login: async () => RA.ok(session({ did: 'did:plc:prev' })) });
    await t.seedPrevious();
    const before = t.snapshot();

    const result = await t.useCase.run({ ...t.input, toDid: 'did:plc:prev' });

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyDidChanged' } });
    expect(t.snapshot()).toEqual(before);
  });

  it('いまの DID が決まらないときは DidChanged にする', async () => {
    const t = await setup();

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyDidChanged' } });
    expect(t.snapshot()).toEqual({ credentials: [], sessions: [], loginFailures: [], switches: [], events: [] });
  });

  it('切り替え中は SwitchInProgress にし、Bluesky を呼ばない', async () => {
    const t = await setup();
    await t.seedPrevious();
    insertBlueskyAccountSwitch(t.sqlite, { fromDid: 'did:plc:prev', toDid: 'did:plc:next' });
    const before = t.snapshot();

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyAccountSwitchInProgress' } });
    expect(t.verifier.login).not.toHaveBeenCalled();
    expect(t.snapshot()).toEqual(before);
  });

  it('1段目の書き込みが途中で失敗したら、何も残さない', async () => {
    const t = await setup();
    await t.seedPrevious();
    t.sqlite.exec(
      'CREATE TRIGGER fail_event_insert BEFORE INSERT ON domain_events BEGIN SELECT RAISE(ABORT, \'forced failure\'); END',
    );
    const before = t.snapshot();

    await expect(t.useCase.run(t.input)).rejects.toThrow();

    expect(t.snapshot()).toEqual(before);
  });

  it('1段目の書き込みが想定外のエラーで失敗したときは、新しいセッションを logout する', async () => {
    const t = await setup();
    await t.seedPrevious();
    t.sqlite.exec(
      'CREATE TRIGGER fail_event_insert BEFORE INSERT ON domain_events BEGIN SELECT RAISE(ABORT, \'forced failure\'); END',
    );

    await expect(t.useCase.run(t.input)).rejects.toThrow();

    expect(t.verifier.logout).toHaveBeenCalledWith(session());
  });
});

describe('SwitchBlueskyAccountUseCase の成功', () => {
  it('1段目の行を1回の書き込みでそろえ、切り替え中の状態を返す', async () => {
    const t = await setup({ chat: false });
    await t.seedPrevious();

    const result = await t.useCase.run({ ...t.input, identifier: ' next.bsky.social ' });

    expect(result).toEqual({
      ok: true,
      val: {
        state: 'purging',
        fromDid: 'did:plc:prev',
        toDid: 'did:plc:next',
        startedAt: NOW,
        attempts: 0,
        lastError: null,
        stalled: false,
      },
    });
    const snapshot = t.snapshot();
    expect(snapshot.switches).toEqual([
      {
        id: 'default',
        switchId: expect.any(String),
        fromDid: 'did:plc:prev',
        toDid: 'did:plc:next',
        startedAt: NOW,
        attempts: 0,
        lastError: null,
        deletedCounts: expect.stringContaining('"timelineItems":0'),
        updatedAt: NOW,
      },
    ]);
    expect(snapshot.credentials).toMatchObject([
      {
        id: 'default',
        identifier: 'next.bsky.social',
        did: 'did:plc:next',
        handle: 'next.bsky.social',
        chatPermitted: 0,
      },
    ]);
    expect(snapshot.sessions).toMatchObject([{
      did: 'did:plc:next',
      accessJwt: 'new-access',
      refreshJwt: 'new-refresh',
    }]);
    expect(snapshot.loginFailures).toEqual([]);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]).toMatchObject({
      aggregateName: 'blueskyAccountSwitch',
      eventName: 'blueskyAccountSwitch.started',
    });
    const event = snapshot.events[0] as { aggregateId: string; eventPayload: string };
    expect(JSON.parse(event.aggregateId)).toBe((snapshot.switches[0] as { switchId: string }).switchId);
    expect(JSON.parse(event.eventPayload)).toEqual({ fromDid: 'did:plc:prev', toDid: 'did:plc:next', startedAt: NOW });
  });

  it('前のアカウントのミュートとブロックの行を1段目で消し、消した件数を切り替えの行とイベントの件数に入れる', async () => {
    const t = await setup();
    await t.seedPrevious();
    t.sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,blockUri,updatedAt) VALUES (?,?,?,?)')
      .run('did:plc:muted', 1, null, 1);
    t.sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,blockUri,updatedAt) VALUES (?,?,?,?)')
      .run('did:plc:blocked', 0, 'at://did:plc:prev/app.bsky.graph.block/1', 1);

    expect((await t.useCase.run(t.input)).ok).toBe(true);

    expect(t.sqlite.prepare('SELECT did FROM bluesky_moderated_actors').all()).toEqual([]);
    const snapshot = t.snapshot();
    const switchRow = snapshot.switches[0] as { deletedCounts: string };
    expect(JSON.parse(switchRow.deletedCounts)).toMatchObject({ moderatedActors: 2, timelineItems: 0 });
    const event = snapshot.events[0] as { aggregateState: string };
    expect(JSON.parse(event.aggregateState).deletedCounts).toMatchObject({ moderatedActors: 2 });
  });

  it('アプリパスワードは、暗号化した列にだけ入り、他の行にもイベントにも入らない', async () => {
    const t = await setup();
    await t.seedPrevious();

    await t.useCase.run(t.input);

    const rows = t.snapshot();
    const cipherFor = createAesGcmCipherFactory({ key: KEY, aadOf: blueskyCredentialAad })!;
    const credential = rows.credentials[0] as { appPasswordCiphertext: string; appPasswordIv: string };
    expect(
      await cipherFor('did:plc:next').decrypt({
        ciphertext: credential.appPasswordCiphertext,
        iv: credential.appPasswordIv,
      }),
    ).toBe(APP_PASSWORD);
    expect(JSON.stringify(rows)).not.toContain(APP_PASSWORD);
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });

  it('成功の後の2回目の切り替えは SwitchInProgress にし、資格情報を変えない', async () => {
    const t = await setup();
    await t.seedPrevious();
    expect((await t.useCase.run(t.input)).ok).toBe(true);
    const before = t.snapshot();

    const second = await t.useCase.run({ ...t.input, fromDid: 'did:plc:next', toDid: 'did:plc:third' });

    expect(second).toMatchObject({ ok: false, err: { type: 'BlueskyAccountSwitchInProgress' } });
    expect(t.snapshot()).toEqual(before);
  });

  it('いまの DID を env の資格情報でのログインで決め、その session は保存せず logout する', async () => {
    const envSession = session({ did: 'did:plc:prev', handle: 'env.example.com', accessJwt: 'env-access' });
    const t = await setup({
      env: ENV_CREDENTIALS,
      login: async (credentials) =>
        credentials.identifier === ENV_CREDENTIALS.identifier ? RA.ok(envSession) : RA.ok(session()),
    });

    const result = await t.useCase.run(t.input);

    expect(result).toMatchObject({ ok: true, val: { state: 'purging', fromDid: 'did:plc:prev' } });
    expect(t.verifier.logout).toHaveBeenCalledWith(envSession);
    expect(t.snapshot().sessions).toMatchObject([{ accessJwt: 'new-access' }]);
  });
});
