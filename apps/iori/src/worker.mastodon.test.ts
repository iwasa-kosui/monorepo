import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from './adaptor/d1/__tests__/sqliteFixture.ts';
import { CredentialAccountSchema, InstanceV2Schema } from './adaptor/mastodon/entities.ts';
import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const origin = 'https://worker.test';
const userId = crypto.randomUUID();
const actorId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const executionContext = {} as ExecutionContext;

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
    actorId,
    `${origin}/users/kosui`,
    `${origin}/users/kosui/inbox`,
    'local',
  );
  sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(actorId, userId);
  sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
    sessionId,
    userId,
    Date.now() + 60_000,
  );
  sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
    crypto.randomUUID(),
    actorId,
    'hello',
    Date.UTC(2025, 0, 2),
    'local',
  );
  const env = {
    DB: fixture.binding,
    UPLOADS: { get: async () => null, put: async () => undefined, head: async () => null },
    FEDIFY_KV: { get: async () => null },
    FEDIFY_QUEUE: { send: async () => undefined, sendBatch: async () => undefined },
    ASSETS: {
      fetch: async (input: RequestInfo | URL) =>
        new URL(String(input)).pathname === '/manifest.json'
          ? new Response('{}', { status: 200 })
          : new Response('Not Found', { status: 404 }),
    },
    ...admissionFixture(),
    VAPID_SUBJECT: 'mailto:admin@example.invalid',
    VAPID_PUBLIC_KEY: 'fixture-public',
    VAPID_PRIVATE_KEY: 'fixture-private',
  } as unknown as IoriWorkerEnv;
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`${origin}${path}`, init), env, executionContext);
  return { request };
};

describe('Worker の Mastodon 互換 API', () => {
  it('/.well-known/oauth-authorization-server を Fedify の後ろで返す', async () => {
    const response = await setup().request('/.well-known/oauth-authorization-server');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
    });
  });

  it('/.well-known/nodeinfo と /nodeinfo/2.1 を Fedify が返す', async () => {
    const { request } = setup();

    const [links, nodeinfo] = await Promise.all([request('/.well-known/nodeinfo'), request('/nodeinfo/2.1')]);

    expect(links.status).toBe(200);
    expect(await links.json()).toMatchObject({
      links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${origin}/nodeinfo/2.1` }],
    });
    expect(nodeinfo.status).toBe(200);
    expect(await nodeinfo.json()).toMatchObject({ software: { name: 'iori' }, protocols: ['activitypub'] });
  });

  it('/oauth/authorize は client_id がなければ画面でエラーを返す', async () => {
    const response = await setup().request('/oauth/authorize');

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toContain('text/html');
  });

  it('アプリを登録して client_credentials のトークンで apps/verify_credentials を呼べる', async () => {
    const { request } = setup();

    const registered = await request('/api/v1/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Ivory', redirect_uris: 'urn:ietf:wg:oauth:2.0:oob', scopes: 'read' }),
    });
    const app = await registered.json() as { client_id: string; client_secret: string };
    const token = await request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: app.client_id,
        client_secret: app.client_secret,
        scope: 'read',
      }),
    });
    const { access_token } = await token.json() as { access_token: string };
    const verified = await request('/api/v1/apps/verify_credentials', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    expect(registered.status).toBe(200);
    expect(token.status).toBe(200);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ name: 'Ivory' });
  });

  it('/api/v2/instance を認証なしで返し、連絡先とキーを D1 と環境から入れる', async () => {
    const response = await setup().request('/api/v2/instance');

    expect(response.status).toBe(200);
    const body = InstanceV2Schema.parse(await response.json());
    expect(body).toMatchObject({
      domain: 'worker.test',
      title: 'worker.test',
      description: 'A microblog by kosui',
      contact: { account: { username: 'kosui', statuses_count: 1 } },
      configuration: { vapid: { public_key: 'fixture-public' } },
    });
  });

  it('Cookie の利用者で verify_credentials を返す', async () => {
    const response = await setup().request('/api/v1/accounts/verify_credentials', {
      headers: { Cookie: `sessionId=${sessionId}` },
    });

    expect(response.status).toBe(200);
    expect(CredentialAccountSchema.parse(await response.json())).toMatchObject({
      id: actorId,
      username: 'kosui',
      statuses_count: 1,
      last_status_at: '2025-01-02',
      avatar: `${origin}/default-avatar.png`,
    });
  });

  it('認証がなければ verify_credentials は 401 にする', async () => {
    const response = await setup().request('/api/v1/accounts/verify_credentials');

    expect(response.status).toBe(401);
  });

  it('未実装の /api/v1 と /api/v2 のパスは 404 の JSON にし、認証付きの要求をログに出す', async () => {
    const { request } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const headers = { Cookie: `sessionId=${sessionId}` };

    const [v1, v2] = await Promise.all([
      request('/api/v1/statuses/abc?q=1', { headers }),
      request('/api/v2/media', { method: 'POST', headers }),
    ]);

    expect([v1.status, v2.status]).toEqual([404, 404]);
    expect(await v1.json()).toEqual({ error: 'Record not found' });
    expect(warn).toHaveBeenCalledWith('Unimplemented Mastodon API: GET /api/v1/statuses/abc');
    expect(warn).toHaveBeenCalledWith('Unimplemented Mastodon API: POST /api/v2/media');
    warn.mockRestore();
  });

  it('/、/sign-in、/.well-known/webfinger を Mastodon のルーターと受け皿の 404 に取らせない', async () => {
    const { request } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const responses = await Promise.all([
      request('/', { headers: { Authorization: 'Bearer none' } }),
      request('/sign-in', { headers: { Authorization: 'Bearer none' } }),
      request('/.well-known/webfinger?resource=acct:kosui@worker.test', { headers: { Authorization: 'Bearer none' } }),
    ]);

    const bodies = await Promise.all(responses.map((response) => response.text()));
    for (const body of bodies) {
      expect(body).not.toContain('Record not found');
    }
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(warn.mock.calls.some((call) => String(call[0]).startsWith('Unimplemented Mastodon API'))).toBe(false);
    warn.mockRestore();
  });

  it('既存の独自 API と /api/og/* の応答を変えない', async () => {
    const { request } = setup();

    const [home, notifications, mutes, vapid, og] = await Promise.all([
      request('/api/v1/home'),
      request('/api/v1/notifications'),
      request('/api/v1/mutes'),
      request('/api/v1/push/vapid-public-key'),
      request('/api/og/articles/not-an-id'),
    ]);

    expect([home.status, notifications.status, mutes.status, vapid.status, og.status]).toEqual([
      401,
      401,
      401,
      200,
      404,
    ]);
    expect(await home.json()).toEqual({ error: 'Unauthorized' });
    expect(await vapid.json()).toEqual({ publicKey: 'fixture-public' });
    expect(await og.text()).toBe('Not Found');
  });
});
