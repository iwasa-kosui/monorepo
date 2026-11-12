import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from './adaptor/d1/__tests__/sqliteFixture.ts';
import { admissionFixture } from './testing/admissionFixture.ts';
import worker from './worker.ts';
import type { IoriWorkerEnv } from './workerEnv.ts';

const origin = 'https://worker.test';
const userId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const otherUserId = crypto.randomUUID();
const otherSessionId = crypto.randomUUID();
const executionContext = {} as ExecutionContext;
const NOW = Date.UTC(2026, 10, 8);

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = ({ withOwner = true } = {}) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  if (withOwner) {
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
    sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
      sessionId,
      userId,
      Date.now() + 60_000,
    );
  }
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(otherUserId, 'other');
  sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
    otherSessionId,
    otherUserId,
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

  it('所有者でないユーザーの /x は 404 にし、画面を返さない', async () => {
    const response = await setup().request('/x', { headers: { Cookie: `sessionId=${otherSessionId}` } });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('/static/xPosts.js');
  });

  it('所有者のユーザーが見つからないときは、ログイン中の /x を 404 にする', async () => {
    const response = await setup({ withOwner: false }).request('/x', {
      headers: { Cookie: `sessionId=${otherSessionId}` },
    });

    expect(response.status).toBe(404);
  });

  it('所有者でないユーザーの API は 403 にし、投稿を返さない', async () => {
    const response = await setup().request('/api/iori/v1/x-posts', {
      headers: { Cookie: `sessionId=${otherSessionId}` },
    });

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('secret');
  });
});
