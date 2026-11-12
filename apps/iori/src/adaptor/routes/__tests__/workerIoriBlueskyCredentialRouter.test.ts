import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Argon2idDerive } from '../../../domain/password/argon2idDerive.ts';
import { Password } from '../../../domain/password/password.ts';
import { createBlueskyCredentialRuntimePorts } from '../../../runtime/blueskyCredential.ts';
import type { IoriWorkerEnv } from '../../../workerEnv.ts';
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
  const put = (body: unknown) => send('PUT', body);
  const validBody = { identifier: 'alice.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop', currentPassword: PASSWORD };
  return { send, put, validBody, fetchMock, sqlite };
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
    expect(await response.json()).toEqual({ error: 'did_mismatch' });
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

  it('何も無ければ none を返す', async () => {
    const t = await setup();

    const response = await t.send('DELETE');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: 'none' });
  });
});
