import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Argon2idDerive } from '../../../domain/password/argon2idDerive.ts';
import { Password } from '../../../domain/password/password.ts';
import { createBlueskyCredentialRuntimePorts } from '../../../runtime/blueskyCredential.ts';
import type { IoriWorkerEnv } from '../../../workerEnv.ts';
import {
  insertBlueskyAccountSwitch,
  seedBlueskyData,
  seedNotifications,
} from '../../d1/__tests__/blueskyAccountSwitchFixture.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriBlueskyCredentialRouter } from '../workerIoriBlueskyCredentialRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const PATH = '/api/iori/v1/bluesky/credential';
const PASSWORD = 'correct-horse-battery';
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(5)));

const fakeDerive: Argon2idDerive = async ({ password, salt, tagLength }) =>
  Uint8Array.from({ length: tagLength }, (_, index) => password[index % password.length]! ^ salt[index % salt.length]!);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const sessionBody = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  accessJwt: 'new-access',
  refreshJwt: 'new-refresh',
  didDoc: {
    service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }],
  },
};

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = async (
  options: {
    env?: Partial<IoriWorkerEnv>;
    fetch?: (url: string, init: RequestInit) => Response | Promise<Response>;
  } = {},
) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  const seed = createMastodonSeed(fixture);
  const hashed = await Password.hashPassword(fakeDerive)(Password.orThrow(PASSWORD));
  const signIn = async (username: string) => {
    const issued = await harness.issueUserToken('read write');
    seed.addLocalActor(username, issued.userId);
    sqlite.prepare(
      'INSERT INTO user_passwords(userId,algorithm,parallelism,tagLength,memory,passes,nonceHex,tagHex) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      issued.userId,
      hashed.algorithm,
      hashed.parallelism,
      hashed.tagLength,
      hashed.memory,
      hashed.passes,
      hashed.nonceHex,
      hashed.tagHex,
    );
    return issued;
  };
  const issued = await signIn('kosui');
  const fetchMock = vi.fn(
    options.fetch ?? (async (url: string) => {
      if (url.endsWith('createSession')) return json(sessionBody);
      return json({ convos: [] });
    }),
  );
  const env = { BLUESKY_CREDENTIAL_KEY: KEY, ...options.env };
  const envCredentials = env.BLUESKY_IDENTIFIER !== undefined && env.BLUESKY_APP_PASSWORD !== undefined
    ? { identifier: env.BLUESKY_IDENTIFIER, appPassword: env.BLUESKY_APP_PASSWORD }
    : undefined;
  const app = new Hono().route(
    '/api',
    createWorkerIoriBlueskyCredentialRouter({
      authn: createMastodonAuthn({
        verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
        sessionResolver: harness.memory.sessionResolver as never,
      }),
      // 本番と同じく、env の資格情報はオーナー（最初にログインした kosui）にだけ渡す
      forUser: async (userId) =>
        createBlueskyCredentialRuntimePorts(
          {
            userId,
            envCredentials: userId === issued.userId ? envCredentials : undefined,
            credentialKey: env.BLUESKY_CREDENTIAL_KEY,
          },
          fixture.db,
          { argon2idDerive: fakeDerive, fetch: fetchMock as unknown as typeof fetch },
        ),
    }),
  );
  const bearer = { Authorization: `Bearer ${issued.token}` };
  const send = (method: string, body?: unknown, headers: Record<string, string> = bearer) =>
    app.request(`${ORIGIN}${PATH}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const sendTo = (path: string, method: string, body?: unknown, headers: Record<string, string> = bearer) =>
    app.request(`${ORIGIN}/api/iori/v1/bluesky/${path}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const put = (body: unknown) => send('PUT', body);
  const seedCurrent = (did = 'did:plc:other', handle = 'other.example', userId: string = issued.userId) =>
    sqlite.prepare(
      'INSERT INTO bluesky_sessions(userId,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    ).run(userId, did, handle, 'https://pds.example', 'old', 'old', 1_000);
  const seedStoredCredential = (did = 'did:plc:alice', userId: string = issued.userId) =>
    sqlite.prepare(
      'INSERT INTO bluesky_credentials(userId,identifier,did,handle,appPasswordCiphertext,appPasswordIv,keyVersion,chatPermitted,verifiedAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(userId, 'alice.bsky.social', did, 'alice.bsky.social', 'Y2lwaGVy', 'aXY=', 1, 1, 1_000, 1_000);
  const switchBody = {
    ...{ identifier: 'alice.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop', currentPassword: PASSWORD },
    fromDid: 'did:plc:other',
    toDid: 'did:plc:alice',
  };
  const validBody = { identifier: 'alice.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop', currentPassword: PASSWORD };
  /** kosui とは別のユーザーでログインする */
  const anotherUser = async () => {
    const other = await signIn('bob');
    const headers = { Authorization: `Bearer ${other.token}` };
    return {
      userId: other.userId,
      send: (method: string, body?: unknown) => send(method, body, headers),
      sendTo: (path: string, method: string, body?: unknown) => sendTo(path, method, body, headers),
    };
  };
  return {
    send,
    sendTo,
    put,
    anotherUser,
    validBody,
    switchBody,
    seedCurrent,
    seedStoredCredential,
    fetchMock,
    sqlite,
    userId: issued.userId,
  };
};

describe('認証とユーザーごとの資格情報', () => {
  it.each(['GET', 'PUT', 'DELETE'])('%s は認証が無いと 401', async (method) => {
    const t = await setup();

    const response = await t.send(method, method === 'PUT' ? t.validBody : undefined, {
      Origin: ORIGIN,
    });

    expect(response.status).toBe(401);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('登録はログイン中のユーザーのものになり、ほかのユーザーの GET には出ない', async () => {
    const t = await setup();
    const bob = await t.anotherUser();

    expect((await t.put(t.validBody)).status).toBe(200);

    expect(await (await t.send('GET')).json()).toMatchObject({ source: 'settings', did: 'did:plc:alice' });
    expect(await (await bob.send('GET')).json()).toMatchObject({ source: 'none', did: null });
    expect(t.sqlite.prepare('SELECT userId, did FROM bluesky_credentials').all()).toEqual([
      { userId: t.userId, did: 'did:plc:alice' },
    ]);
  });

  it('env の資格情報はオーナーにだけ使い、ほかのユーザーには secret を見せない', async () => {
    const t = await setup({ env: { BLUESKY_IDENTIFIER: 'env.example.com', BLUESKY_APP_PASSWORD: 'env-secret' } });
    const bob = await t.anotherUser();

    expect(await (await t.send('GET')).json()).toMatchObject({ source: 'secret' });
    expect(await (await bob.send('GET')).json()).toMatchObject({ source: 'none' });
  });

  it('ほかのユーザーの DELETE は、ログイン中のユーザーの登録を消さない', async () => {
    const t = await setup();
    const bob = await t.anotherUser();
    expect((await t.put(t.validBody)).status).toBe(200);

    expect((await bob.send('DELETE')).status).toBe(200);

    expect(t.sqlite.prepare('SELECT userId FROM bluesky_credentials').all()).toEqual([{ userId: t.userId }]);
    expect(t.sqlite.prepare('SELECT userId FROM bluesky_sessions').all()).toEqual([{ userId: t.userId }]);
  });
});

describe('GET /api/iori/v1/bluesky/credential', () => {
  it('何も設定が無ければ none を返し、鍵があれば registrable を true にする', async () => {
    const t = await setup();

    const response = await t.send('GET');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: 'none',
      handle: null,
      did: null,
      chatPermitted: null,
      verifiedAt: null,
      registrable: true,
    });
  });

  it('env の資格情報だけのときは secret を返し、handle と did は保存済みのセッションから取る', async () => {
    const t = await setup({
      env: { BLUESKY_CREDENTIAL_KEY: undefined, BLUESKY_IDENTIFIER: 'env.example.com', BLUESKY_APP_PASSWORD: 'x' },
    });
    t.seedCurrent('did:plc:env', 'env.example.com');

    const response = await t.send('GET');

    expect(await response.json()).toEqual({
      source: 'secret',
      handle: 'env.example.com',
      did: 'did:plc:env',
      chatPermitted: null,
      verifiedAt: null,
      registrable: false,
    });
  });

  it('登録後は settings を返し、アプリパスワードを含めない', async () => {
    const t = await setup({ env: { BLUESKY_IDENTIFIER: 'env.example.com', BLUESKY_APP_PASSWORD: 'env-secret' } });
    expect((await t.put(t.validBody)).status).toBe(200);

    const response = await t.send('GET');
    const text = await response.text();

    expect(JSON.parse(text)).toMatchObject({
      source: 'settings',
      handle: 'alice.bsky.social',
      did: 'did:plc:alice',
      chatPermitted: true,
      registrable: true,
    });
    expect(text).not.toContain('abcd-efgh-ijkl-mnop');
    expect(text).not.toContain('env-secret');
  });
});

describe('PUT /api/iori/v1/bluesky/credential', () => {
  it.each([
    [{}],
    [{ identifier: '', appPassword: 'a', currentPassword: 'b' }],
    [{ identifier: 'a', appPassword: 1, currentPassword: 'b' }],
    [{ identifier: 'a', appPassword: 'a' }],
  ])('入力が不正なら 400 invalid_input（%j）', async (body) => {
    const t = await setup();

    const response = await t.put(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_input' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('鍵が無ければ 503 credential_key_missing', async () => {
    const t = await setup({ env: { BLUESKY_CREDENTIAL_KEY: undefined } });

    const response = await t.put(t.validBody);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'credential_key_missing' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('パスワードが違えば 403 invalid_password', async () => {
    const t = await setup();

    const response = await t.put({ ...t.validBody, currentPassword: 'wrong-password-value' });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'invalid_password' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('Bluesky へのログインに失敗したら 422 bluesky_login_failed', async () => {
    const t = await setup({ fetch: () => json({ error: 'AuthenticationRequired' }, 401) });

    const response = await t.put(t.validBody);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'bluesky_login_failed' });
  });

  it('DID が違えば 409 did_mismatch で、今と次のアカウントを返す', async () => {
    const t = await setup();
    t.seedCurrent('did:plc:other', 'other.example');

    const response = await t.put(t.validBody);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'did_mismatch',
      current: { did: 'did:plc:other', handle: 'other.example' },
      next: { did: 'did:plc:alice', handle: 'alice.bsky.social' },
    });
  });

  it('そのアカウントがほかのユーザーにつながっていれば 409 account_linked_elsewhere で、保存しない', async () => {
    const t = await setup();
    const bob = await t.anotherUser();
    t.seedStoredCredential('did:plc:alice', bob.userId);

    const response = await t.put(t.validBody);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'account_linked_elsewhere' });
    expect(t.sqlite.prepare('SELECT userId FROM bluesky_credentials').all()).toEqual([{ userId: bob.userId }]);
    expect(t.sqlite.prepare('SELECT * FROM bluesky_sessions').all()).toEqual([]);
  });

  it('成功したら 200 で共通の形を返し、DM の可否を調べて保存する', async () => {
    const t = await setup({
      fetch: (url) => url.endsWith('createSession') ? json(sessionBody) : json({ error: 'InvalidToken' }, 400),
    });

    const response = await t.put(t.validBody);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: 'settings',
      handle: 'alice.bsky.social',
      did: 'did:plc:alice',
      chatPermitted: false,
      verifiedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      registrable: true,
    });
    const calls = t.fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[1]![0]).toBe('https://pds.example/xrpc/chat.bsky.convo.listConvos?limit=1');
  });
});

describe('DELETE /api/iori/v1/bluesky/credential', () => {
  it('登録と保存済みのセッションを消し、env の資格情報があれば secret を返す', async () => {
    const t = await setup({ env: { BLUESKY_IDENTIFIER: 'env.example.com', BLUESKY_APP_PASSWORD: 'env-secret' } });
    expect((await t.put(t.validBody)).status).toBe(200);

    const response = await t.send('DELETE');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: 'secret',
      handle: null,
      did: null,
      chatPermitted: null,
      verifiedAt: null,
      registrable: true,
    });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_credentials').all()).toEqual([]);
    expect(t.sqlite.prepare('SELECT * FROM bluesky_sessions').all()).toEqual([]);
  });
});

describe('切り替え中の PUT と DELETE', () => {
  it('PUT は 409 switch_in_progress で、Bluesky を呼ばない', async () => {
    const t = await setup();
    insertBlueskyAccountSwitch(t.sqlite, t.userId);

    const response = await t.put(t.validBody);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'switch_in_progress' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('DELETE は 409 switch_in_progress で、何も消さない', async () => {
    const t = await setup();
    t.seedStoredCredential();
    insertBlueskyAccountSwitch(t.sqlite, t.userId);

    const response = await t.send('DELETE');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'switch_in_progress' });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_credentials').all()).toHaveLength(1);
  });

  it('DELETE は secret の DID が現在の DID と違えば 409 env_account_differs で、何も消さない', async () => {
    const t = await setup({
      env: { BLUESKY_IDENTIFIER: 'env.example.com', BLUESKY_APP_PASSWORD: 'env-secret' },
      fetch: () => json({ ...sessionBody, did: 'did:plc:env', handle: 'env.example.com' }),
    });
    t.seedStoredCredential('did:plc:alice');
    t.seedCurrent('did:plc:alice', 'alice.bsky.social');

    const response = await t.send('DELETE');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'env_account_differs' });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_credentials').all()).toHaveLength(1);
    expect(t.sqlite.prepare('SELECT accessJwt FROM bluesky_sessions').all()).toEqual([{ accessJwt: 'old' }]);
  });
});

describe('アカウントの切り替えの認証とユーザーごとの状態', () => {
  const targets = [
    ['account-switch/preview', 'GET'],
    ['account-switch', 'GET'],
    ['account-switch', 'POST'],
  ] as const;

  it.each(targets)('%s の %s は認証が無いと 401', async (path, method) => {
    const t = await setup();

    const response = await t.sendTo(path, method, method === 'POST' ? t.switchBody : undefined, { Origin: ORIGIN });

    expect(response.status).toBe(401);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('切り替えの状態と削除される件数は、ログイン中のユーザーのものだけを返す', async () => {
    const t = await setup();
    const bob = await t.anotherUser();
    insertBlueskyAccountSwitch(t.sqlite, bob.userId);
    seedBlueskyData(t.sqlite, bob.userId, { timelineItems: 3 });

    expect(await (await t.sendTo('account-switch', 'GET')).json()).toEqual({ state: 'idle' });
    expect(await (await t.sendTo('account-switch/preview', 'GET')).json()).toMatchObject({
      counts: { timelineItems: 0 },
    });
    expect(await (await bob.sendTo('account-switch', 'GET')).json()).toMatchObject({ state: 'purging' });
  });
});

describe('GET /api/iori/v1/bluesky/account-switch/preview', () => {
  it('削除される件数を返し、通知は Bluesky の type だけを数える', async () => {
    const t = await setup();
    seedBlueskyData(t.sqlite, t.userId, {
      timelineItems: 3,
      likes: 2,
      reposts: 1,
      bookmarks: 4,
      moderatedActors: 5,
      crossposts: 6,
    });
    seedNotifications(t.sqlite, t.userId, [
      { id: 'n1', type: 'blueskyLike', createdAt: 1 },
      { id: 'n2', type: 'blueskyMention', createdAt: 2 },
      { id: 'n3', type: 'follow', createdAt: 3 },
    ]);

    const response = await t.sendTo('account-switch/preview', 'GET');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      counts: {
        timelineItems: 3,
        notifications: 2,
        likes: 2,
        reposts: 1,
        bookmarks: 4,
        moderatedActors: 5,
        crossposts: 6,
      },
    });
  });
});

describe('GET /api/iori/v1/bluesky/account-switch', () => {
  it('印が無ければ idle を返す', async () => {
    const t = await setup();

    const response = await t.sendTo('account-switch', 'GET');

    expect(await response.json()).toEqual({ state: 'idle' });
  });

  it('印があれば purging と進捗を返し、試行が 30 回を超えたら stalled にする', async () => {
    const t = await setup();
    insertBlueskyAccountSwitch(t.sqlite, t.userId, {
      startedAt: Date.UTC(2026, 10, 12, 3, 4, 5),
      attempts: 31,
      lastError: 'Error: boom',
    });

    const response = await t.sendTo('account-switch', 'GET');

    expect(await response.json()).toEqual({
      state: 'purging',
      fromDid: 'did:plc:old',
      toDid: 'did:plc:alice',
      startedAt: '2026-11-12T03:04:05.000Z',
      attempts: 31,
      lastError: 'Error: boom',
      stalled: true,
    });
  });
});

describe('POST /api/iori/v1/bluesky/account-switch', () => {
  it.each([
    [{}],
    [{ identifier: 'a', appPassword: 'a', currentPassword: 'b', fromDid: 'did:plc:a' }],
    [{ identifier: 'a', appPassword: 'a', currentPassword: 'b', fromDid: '', toDid: 'did:plc:b' }],
  ])('入力が不正なら 400 invalid_input（%j）', async (body) => {
    const t = await setup();

    const response = await t.sendTo('account-switch', 'POST', body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_input' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('鍵が無ければ 503 credential_key_missing', async () => {
    const t = await setup({ env: { BLUESKY_CREDENTIAL_KEY: undefined } });

    const response = await t.sendTo('account-switch', 'POST', t.switchBody);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'credential_key_missing' });
  });

  it('パスワードが違えば 403 invalid_password', async () => {
    const t = await setup();

    const response = await t.sendTo('account-switch', 'POST', {
      ...t.switchBody,
      currentPassword: 'wrong-password-value',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'invalid_password' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('Bluesky へのログインに失敗したら 422 bluesky_login_failed で、何も変えない', async () => {
    const t = await setup({ fetch: () => json({ error: 'AuthenticationRequired' }, 401) });
    t.seedCurrent();

    const response = await t.sendTo('account-switch', 'POST', t.switchBody);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'bluesky_login_failed' });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toEqual([]);
  });

  it.each([
    ['fromDid が現在の DID と違う', { fromDid: 'did:plc:someone-else' }, 'did:plc:other'],
  ])('%s と 409 did_changed で、何も変えない', async (_name, override, currentDid) => {
    const t = await setup();
    t.seedCurrent(currentDid);

    const response = await t.sendTo('account-switch', 'POST', { ...t.switchBody, ...override });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'did_changed' });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toEqual([]);
    expect(t.sqlite.prepare('SELECT accessJwt FROM bluesky_sessions').all()).toEqual([{ accessJwt: 'old' }]);
  });

  it('切り替え先のアカウントがほかのユーザーにつながっていれば 409 account_linked_elsewhere で、何も変えない', async () => {
    const t = await setup();
    const bob = await t.anotherUser();
    t.seedCurrent();
    t.seedStoredCredential('did:plc:alice', bob.userId);

    const response = await t.sendTo('account-switch', 'POST', t.switchBody);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'account_linked_elsewhere' });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toEqual([]);
    expect(t.sqlite.prepare('SELECT userId FROM bluesky_credentials').all()).toEqual([{ userId: bob.userId }]);
    expect(t.sqlite.prepare('SELECT accessJwt FROM bluesky_sessions').all()).toEqual([{ accessJwt: 'old' }]);
  });

  it('切り替え中は 409 switch_in_progress', async () => {
    const t = await setup();
    t.seedCurrent();
    insertBlueskyAccountSwitch(t.sqlite, t.userId);

    const response = await t.sendTo('account-switch', 'POST', t.switchBody);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'switch_in_progress' });
  });

  it('成功したら 202 で purging を返し、アプリパスワードを応答に含めない', async () => {
    const t = await setup();
    t.seedCurrent();

    const response = await t.sendTo('account-switch', 'POST', t.switchBody);
    const text = await response.text();

    expect(response.status).toBe(202);
    expect(JSON.parse(text)).toEqual({
      state: 'purging',
      fromDid: 'did:plc:other',
      toDid: 'did:plc:alice',
      startedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      attempts: 0,
      lastError: null,
      stalled: false,
    });
    expect(text).not.toContain('abcd-efgh-ijkl-mnop');
    expect(text).not.toContain(PASSWORD);
    expect(t.sqlite.prepare('SELECT did FROM bluesky_credentials').all()).toEqual([{ did: 'did:plc:alice' }]);
    expect(t.sqlite.prepare('SELECT accessJwt FROM bluesky_sessions').all()).toEqual([{ accessJwt: 'new-access' }]);
    expect(await (await t.sendTo('account-switch', 'GET')).json()).toMatchObject({ state: 'purging' });
  });
});
