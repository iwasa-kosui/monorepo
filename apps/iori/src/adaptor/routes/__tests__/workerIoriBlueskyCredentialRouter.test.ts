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
    owner?: boolean;
    env?: Partial<IoriWorkerEnv>;
    fetch?: (url: string, init: RequestInit) => Response | Promise<Response>;
  } = {},
) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  const issued = await harness.issueUserToken('read write');
  const seed = createMastodonSeed(fixture);
  if (options.owner === false) seed.addLocalActor('alice', issued.userId);
  else seed.addLocalActor('kosui', issued.userId);
  const hashed = await Password.hashPassword(fakeDerive)(Password.orThrow(PASSWORD));
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
  const fetchMock = vi.fn(
    options.fetch ?? (async (url: string) => {
      if (url.endsWith('createSession')) return json(sessionBody);
      return json({ convos: [] });
    }),
  );
  const ports = createBlueskyCredentialRuntimePorts(
    { BLUESKY_CREDENTIAL_KEY: KEY, ...options.env } as IoriWorkerEnv,
    fixture.db,
    { argon2idDerive: fakeDerive, fetch: fetchMock as unknown as typeof fetch },
  );
  const app = new Hono().route(
    '/api',
    createWorkerIoriBlueskyCredentialRouter({
      ...ports,
      authn: createMastodonAuthn({
        verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
        sessionResolver: harness.memory.sessionResolver as never,
      }),
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
  const seedCurrent = (did = 'did:plc:other', handle = 'other.example') =>
    sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    ).run('default', did, handle, 'https://pds.example', 'old', 'old', 1_000);
  const seedStoredCredential = (did = 'did:plc:alice') =>
    sqlite.prepare(
      'INSERT INTO bluesky_credentials(id,identifier,did,handle,appPasswordCiphertext,appPasswordIv,keyVersion,chatPermitted,verifiedAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run('default', 'alice.bsky.social', did, 'alice.bsky.social', 'Y2lwaGVy', 'aXY=', 1, 1, 1_000, 1_000);
  const switchBody = {
    ...{ identifier: 'alice.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop', currentPassword: PASSWORD },
    fromDid: 'did:plc:other',
    toDid: 'did:plc:alice',
  };
  const validBody = { identifier: 'alice.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop', currentPassword: PASSWORD };
  return { send, sendTo, put, validBody, switchBody, seedCurrent, seedStoredCredential, fetchMock, sqlite };
};

describe('認証と所有者の確認', () => {
  it.each(['GET', 'PUT', 'DELETE'])('%s は認証が無いと 401', async (method) => {
    const t = await setup();

    const response = await t.send(method, method === 'PUT' ? t.validBody : undefined, {
      Origin: ORIGIN,
    });

    expect(response.status).toBe(401);
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'DELETE'])('%s は所有者以外だと 403 で、Bluesky を呼ばない', async (method) => {
    const t = await setup({ owner: false });

    const response = await t.send(method, method === 'PUT' ? t.validBody : undefined);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(t.sqlite.prepare('SELECT * FROM bluesky_credentials').all()).toEqual([]);
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
    t.sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
      .run('default', 'did:plc:env', 'env.example.com', 'https://pds.example', 'a', 'r', 1_000);

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

  it('Bluesky へのログインに失敗したら 422 bluesky_login_failed で、何も保存しない', async () => {
    const t = await setup({ fetch: () => json({ error: 'AuthenticationRequired' }, 401) });

    const response = await t.put(t.validBody);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'bluesky_login_failed' });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_credentials').all()).toEqual([]);
    expect(t.sqlite.prepare('SELECT * FROM bluesky_login_failures').all()).toEqual([]);
  });

  it('DID が違えば 409 did_mismatch で、何も保存しない', async () => {
    const t = await setup();
    t.sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
      .run('default', 'did:plc:other', 'other.example', 'https://pds.example', 'old', 'old', 1_000);

    const response = await t.put(t.validBody);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'did_mismatch',
      current: { did: 'did:plc:other', handle: 'other.example' },
      next: { did: 'did:plc:alice', handle: 'alice.bsky.social' },
    });
    expect(t.sqlite.prepare('SELECT * FROM bluesky_credentials').all()).toEqual([]);
    expect(t.sqlite.prepare('SELECT accessJwt FROM bluesky_sessions').all()).toEqual([{ accessJwt: 'old' }]);
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

  it('成功したら bluesky_sessions を上書きし、bluesky_login_failures を消す', async () => {
    const t = await setup();
    t.sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
      .run('default', 'did:plc:alice', 'alice.bsky.social', 'https://pds.example', 'old', 'old', 1_000);
    t.sqlite.prepare('INSERT INTO bluesky_login_failures(scope,failedAt) VALUES (?,?)').run('timeline', 2_000);

    expect((await t.put(t.validBody)).status).toBe(200);

    expect(t.sqlite.prepare('SELECT accessJwt, refreshJwt FROM bluesky_sessions').all()).toEqual([
      { accessJwt: 'new-access', refreshJwt: 'new-refresh' },
    ]);
    expect(t.sqlite.prepare('SELECT * FROM bluesky_login_failures').all()).toEqual([]);
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
    insertBlueskyAccountSwitch(t.sqlite);

    const response = await t.put(t.validBody);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'switch_in_progress' });
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('DELETE は 409 switch_in_progress で、何も消さない', async () => {
    const t = await setup();
    t.seedStoredCredential();
    insertBlueskyAccountSwitch(t.sqlite);

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

describe('アカウントの切り替えの認証と所有者の確認', () => {
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

  it.each(targets)('%s の %s は所有者以外だと 403 で、何も変えない', async (path, method) => {
    const t = await setup({ owner: false });
    t.seedCurrent();

    const response = await t.sendTo(path, method, method === 'POST' ? t.switchBody : undefined);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(t.sqlite.prepare('SELECT * FROM bluesky_account_switch').all()).toEqual([]);
  });
});

describe('GET /api/iori/v1/bluesky/account-switch/preview', () => {
  it('削除される件数を返し、通知は Bluesky の type だけを数える', async () => {
    const t = await setup();
    seedBlueskyData(t.sqlite, {
      timelineItems: 3,
      likes: 2,
      reposts: 1,
      bookmarks: 4,
      moderatedActors: 5,
      crossposts: 6,
    });
    const userId = (t.sqlite.prepare('SELECT userId FROM users').get() as { userId: string }).userId;
    seedNotifications(t.sqlite, userId, [
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
    insertBlueskyAccountSwitch(t.sqlite, {
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

  it('切り替え中は 409 switch_in_progress', async () => {
    const t = await setup();
    t.seedCurrent();
    insertBlueskyAccountSwitch(t.sqlite);

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
