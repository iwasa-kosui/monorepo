import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from './adaptor/d1/__tests__/sqliteFixture.ts';
import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const origin = 'https://worker.test';
const userId = crypto.randomUUID();
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
  sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
    sessionId,
    userId,
    Date.now() + 60_000,
  );
  const sourceId = crypto.randomUUID();
  sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
    .run(sourceId, 'x_user', 'https://x.com/jack', '@jack', 1, 1);
  sqlite.prepare(
    'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?)',
  ).run(
    crypto.randomUUID(),
    sourceId,
    '1',
    'https://x.com/jack/status/1',
    'secret-title',
    'secret-body',
    Date.UTC(2026, 10, 6),
    Date.UTC(2026, 10, 6),
  );
  const env = {
    DB: fixture.binding,
    UPLOADS: { get: async () => null, put: async () => undefined, head: async () => null },
    FEDIFY_KV: { get: async () => null },
    FEDIFY_QUEUE: { send: async () => undefined, sendBatch: async () => undefined },
    ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) },
    ...admissionFixture(),
    VAPID_SUBJECT: 'mailto:admin@example.invalid',
    VAPID_PUBLIC_KEY: 'fixture-public',
    VAPID_PRIVATE_KEY: 'fixture-private',
  } as unknown as IoriWorkerEnv;
  const request = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`${origin}${path}`, { redirect: 'manual', ...init }), env, executionContext);
  return { request };
};

describe('X の画面', () => {
  it('未ログインの /x は /sign-in へ 302 で返し、中身を返さない', async () => {
    const response = await setup().request('/x');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/sign-in');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('存在しないセッションの Cookie は未ログインとして扱う', async () => {
    const response = await setup().request('/x', { headers: { Cookie: `sessionId=${crypto.randomUUID()}` } });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/sign-in');
  });

  it('ログイン中の /x は画面を返し、キャッシュと検索エンジンへの登録を許さない', async () => {
    const response = await setup().request('/x', { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    const html = await response.text();
    expect(html).toContain('/static/xPosts.js');
    expect(html).not.toContain('secret-body');
  });

  it('未ログインの API は 401 にし、投稿を返さない', async () => {
    const response = await setup().request('/api/iori/v1/x-posts');

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('secret');
  });

  it('ログイン中の API は投稿を返し、キャッシュを許さない', async () => {
    const response = await setup().request('/api/iori/v1/x-posts', { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      posts: [{ sourceTitle: '@jack', text: 'secret-body', url: 'https://x.com/jack/status/1' }],
    });
  });
});
