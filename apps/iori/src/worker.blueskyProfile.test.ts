import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it } from 'vitest';

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
const PAGE = '/bluesky/profile/did%3Aplc%3Aalice';
const LIKED_POSTS_API = '/api/iori/v1/bluesky/liked-posts';
const FEEDS_API = '/api/iori/v1/bluesky/feeds';
const FEED_POSTS_API = `/api/iori/v1/bluesky/feeds/posts?uri=${
  encodeURIComponent('at://did:plc:gen/app.bsky.feed.generator/a')
}`;
const PROFILE_API = '/api/iori/v1/bluesky/profiles/did%3Aplc%3Aalice';

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
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(otherUserId, 'other');
  sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(
    otherSessionId,
    otherUserId,
    Date.now() + 60_000,
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

describe('Bluesky のプロフィール画面', () => {
  it('未ログインのページは /sign-in へ 302 で返す', async () => {
    const response = await setup().request(PAGE);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/sign-in');
    expect(await response.text()).toBe('');
  });

  it('所有者のページは画面を返し、キャッシュと検索エンジンへの登録を許さない', async () => {
    const response = await setup().request(PAGE, { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(await response.text()).toContain('/static/blueskyProfile.js');
  });

  it('所有者でないユーザーのページは 404 にし、画面を返さない', async () => {
    const response = await setup().request(PAGE, { headers: { Cookie: `sessionId=${otherSessionId}` } });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('/static/blueskyProfile.js');
  });

  it('フィードのページは、未ログインを 302、所有者を画面、所有者でないユーザーを 404 にする', async () => {
    const t = setup();

    const anonymous = await t.request('/feeds');
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get('Location')).toBe('/sign-in');
    const owner = await t.request('/feeds', { headers: { Cookie: `sessionId=${sessionId}` } });
    expect(owner.status).toBe(200);
    expect(owner.headers.get('Cache-Control')).toBe('no-store');
    expect(await owner.text()).toContain('/static/blueskyFeeds.js');
    const other = await t.request('/feeds', { headers: { Cookie: `sessionId=${otherSessionId}` } });
    expect(other.status).toBe(404);
    expect(await other.text()).not.toContain('/static/blueskyFeeds.js');
  });

  it('未ログインの API は 401、所有者でないユーザーの API は 403 にする', async () => {
    const t = setup();

    expect((await t.request(PROFILE_API)).status).toBe(401);
    expect((await t.request(PROFILE_API, { headers: { Cookie: `sessionId=${otherSessionId}` } })).status).toBe(403);
  });

  it('Bluesky の取り込みが無効なら、所有者の API は 409 にする', async () => {
    const response = await setup().request(PROFILE_API, { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it('いいね一覧の API は、未ログインを 401、所有者でないユーザーを 403、取り込みが無効の所有者を 409 にする', async () => {
    const t = setup();

    expect((await t.request(LIKED_POSTS_API)).status).toBe(401);
    expect((await t.request(LIKED_POSTS_API, { headers: { Cookie: `sessionId=${otherSessionId}` } })).status).toBe(403);
    const disabled = await t.request(LIKED_POSTS_API, { headers: { Cookie: `sessionId=${sessionId}` } });
    expect(disabled.status).toBe(409);
    expect(await disabled.json()).toEqual({ error: 'Bluesky timeline is disabled' });
  });

  it.each([FEEDS_API, FEED_POSTS_API])(
    'フィードの API %s は、未ログインを 401、所有者でないユーザーを 403、取り込みが無効の所有者を 409 にする',
    async (path) => {
      const t = setup();

      expect((await t.request(path)).status).toBe(401);
      expect((await t.request(path, { headers: { Cookie: `sessionId=${otherSessionId}` } })).status).toBe(403);
      const disabled = await t.request(path, { headers: { Cookie: `sessionId=${sessionId}` } });
      expect(disabled.status).toBe(409);
      expect(await disabled.json()).toEqual({ error: 'Bluesky timeline is disabled' });
    },
  );
});
