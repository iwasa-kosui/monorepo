import type { ExecutionContext } from '@cloudflare/workers-types';
import { afterEach, describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from './adaptor/d1/__tests__/sqliteFixture.ts';
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
  const addDigest = (digestDate: string, topicKey = 'summary') => {
    const articleId = crypto.randomUUID();
    sqlite.prepare(
      'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(articleId, actorId, userId, null, `ダイジェスト ${digestDate}`, 'draft', 1_000, null, null);
    sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,topicKey) VALUES (?,?,?,?,?,?,?)',
    )
      .run(crypto.randomUUID(), userId, digestDate, articleId, 2_000, null, topicKey);
    return articleId;
  };
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
  return { request, addDigest };
};

describe('GET /digest', () => {
  it('未ログインなら /sign-in へ 302 で返す', async () => {
    const response = await setup().request('/digest');

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('Location')!, origin).pathname).toBe('/sign-in');
  });

  it('存在しないセッションの Cookie は未ログインとして扱う', async () => {
    const response = await setup().request('/digest', { headers: { Cookie: `sessionId=${crypto.randomUUID()}` } });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('Location')!, origin).pathname).toBe('/sign-in');
  });

  it('ログイン中で digest がなければ /articles へ 302 で返す', async () => {
    const response = await setup().request('/digest', { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('Location')!, origin).pathname).toBe('/articles');
  });

  it('ログイン中で digest があれば、最新のまとめの article へ 302 で返す', async () => {
    const { request, addDigest } = setup();
    addDigest('2026-11-04');
    const latest = addDigest('2026-11-05');

    const response = await request('/digest', { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('Location')!, origin).pathname).toBe(`/articles/${latest}`);
  });

  it('同じ日にトピックの digest が混ざっていても、まとめの article へ 302 で返す', async () => {
    const { request, addDigest } = setup();
    addDigest('2026-11-04');
    const summary = addDigest('2026-11-05');
    addDigest('2026-11-05', 'genai');
    addDigest('2026-11-05', 'security');

    const response = await request('/digest', { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('Location')!, origin).pathname).toBe(`/articles/${summary}`);
  });

  it('より新しい日にトピックの digest だけがあっても、まとめのある日の article へ 302 で返す', async () => {
    const { request, addDigest } = setup();
    const summary = addDigest('2026-11-04');
    addDigest('2026-11-05', 'genai');

    const response = await request('/digest', { headers: { Cookie: `sessionId=${sessionId}` } });

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('Location')!, origin).pathname).toBe(`/articles/${summary}`);
  });
});
