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
const NOW = Date.UTC(2026, 10, 12);

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
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

describe('メッセージの画面', () => {
  it.each(['/messages', '/messages/3kconvo'])('未ログインの %s は /sign-in へ 302 で返す', async (path) => {
    const response = await setup().request(path);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/sign-in');
  });

  it.each(['/messages', '/messages/3kconvo', '/messages/3kconvo/'])(
    '所有者の %s は画面を返し、キャッシュと検索エンジンへの登録を許さない',
    async (path) => {
      const response = await setup().request(path, { headers: { Cookie: `sessionId=${sessionId}` } });

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
      expect(await response.text()).toContain('/static/messages.js');
    },
  );

  it.each(['/messages', '/messages/3kconvo', '/messages/3kconvo/'])(
    '所有者でないユーザーの %s は 404 にし、画面を返さない',
    async (path) => {
      const response = await setup().request(path, { headers: { Cookie: `sessionId=${otherSessionId}` } });

      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('/static/messages.js');
    },
  );
});
