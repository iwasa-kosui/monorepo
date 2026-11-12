import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import {
  createBlueskyTimelineRuntimePorts,
  createCollectBlueskyTimelineUseCase,
  resolveBlueskyTimelineConfig,
} from './blueskyTimeline.ts';

const enabled = {
  IORI_BLUESKY_TIMELINE: 'enabled',
  BLUESKY_IDENTIFIER: ' kosui.me ',
  BLUESKY_APP_PASSWORD: 'app-pass',
};

describe('resolveBlueskyTimelineConfig', () => {
  it('IORI_BLUESKY_TIMELINE が enabled で、2 つの secret が空でないときだけ設定を返す', () => {
    expect(resolveBlueskyTimelineConfig(enabled)).toEqual({ identifier: 'kosui.me', appPassword: 'app-pass' });
    expect(resolveBlueskyTimelineConfig({ ...enabled, IORI_BLUESKY_TIMELINE: 'disabled' })).toBeUndefined();
    expect(resolveBlueskyTimelineConfig({ ...enabled, IORI_BLUESKY_TIMELINE: undefined })).toBeUndefined();
    expect(resolveBlueskyTimelineConfig({ ...enabled, BLUESKY_IDENTIFIER: '' })).toBeUndefined();
    expect(resolveBlueskyTimelineConfig({ ...enabled, BLUESKY_APP_PASSWORD: undefined })).toBeUndefined();
  });

  it('IORI_BLUESKY_CROSSPOST とは独立している', () => {
    expect(
      resolveBlueskyTimelineConfig(
        { ...enabled, IORI_BLUESKY_TIMELINE: 'disabled', IORI_BLUESKY_CROSSPOST: 'enabled' } as never,
      ),
    )
      .toBeUndefined();
    expect(resolveBlueskyTimelineConfig({ ...enabled, IORI_BLUESKY_CROSSPOST: 'disabled' } as never)).toBeDefined();
  });
});

describe('createCollectBlueskyTimelineUseCase', () => {
  it('無効なときは use case を作らない', () => {
    const env = { ...enabled, IORI_BLUESKY_TIMELINE: 'disabled' } as unknown as IoriWorkerEnv;
    expect(createCollectBlueskyTimelineUseCase(env)).toBeUndefined();
  });

  it('有効なときは、保存済みセッションで getTimeline を呼び、取り込んだ投稿を D1 に残す', async () => {
    const { binding, sqlite } = createSqliteD1Fixture();
    const now = Date.now();
    sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
      .run('default', 'did:plc:me', 'kosui.me', 'https://pds.example.net', 'access', 'refresh', now);
    const requests: string[] = [];
    const fetchStub = (async (url: string | URL | Request) => {
      requests.push(String(url));
      return Response.json({
        feed: [{
          post: {
            uri: 'at://did:plc:a/app.bsky.feed.post/1',
            cid: 'cid1',
            author: { did: 'did:plc:a', handle: 'alice.bsky.social' },
            record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: new Date(now).toISOString() },
            indexedAt: new Date(now).toISOString(),
          },
        }],
      });
    }) as typeof fetch;
    const env = { ...enabled, DB: binding } as unknown as IoriWorkerEnv;

    const useCase = createCollectBlueskyTimelineUseCase(env, { fetch: fetchStub });
    const result = await useCase?.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 1, saved: 1, dropped: 0 } });
    expect(requests).toEqual(['https://pds.example.net/xrpc/app.bsky.feed.getTimeline?limit=100']);
    expect(sqlite.prepare('SELECT feedItemId FROM bluesky_timeline_items').all()).toEqual([
      { feedItemId: 'at://did:plc:a/app.bsky.feed.post/1' },
    ]);
  });
});

describe('新しい投稿がない取り込み', () => {
  it('D1 には セッション・既存の確認・リポストの削除対象の SELECT だけを発行し、書き込みは 1 本も発行しない', async () => {
    const { binding, sqlite, queries } = createSqliteD1Fixture();
    const now = Date.now();
    sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
      .run('default', 'did:plc:me', 'kosui.me', 'https://pds.example.net', 'access', 'refresh', now);
    sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
      .run(
        'at://did:plc:a/app.bsky.feed.post/1',
        'u',
        'cid1',
        'did:plc:a',
        'alice.bsky.social',
        'hi',
        '[]',
        now,
        now,
        now,
      );
    const fetchStub = (async () =>
      Response.json({
        feed: [{
          post: {
            uri: 'at://did:plc:a/app.bsky.feed.post/1',
            cid: 'cid1',
            author: { did: 'did:plc:a', handle: 'alice.bsky.social' },
            record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: new Date(now).toISOString() },
            indexedAt: new Date(now).toISOString(),
          },
        }],
        cursor: 'next',
      })) as unknown as typeof fetch;
    const env = { ...enabled, DB: binding } as unknown as IoriWorkerEnv;
    queries.length = 0;

    const result = await createCollectBlueskyTimelineUseCase(env, { fetch: fetchStub })?.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 1, saved: 0, dropped: 0 } });
    expect(queries.map(({ sql }) => sql.trim().split(/\s+/)[0]!.toLowerCase())).toEqual(['select', 'select', 'select']);
    expect(queries[0]!.sql).toContain('bluesky_sessions');
    expect(queries[1]!.sql).toContain('bluesky_timeline_items');
    expect(queries[2]!.sql).toContain('bluesky_reposts');
  });
});

describe('新しい投稿がない取り込み（cron）', () => {
  it('ログインの待ち時間の依存を渡しても、保存済みのセッションが有効なら SELECT 3 本だけで書き込みは 0 本', async () => {
    const { binding, sqlite, queries } = createSqliteD1Fixture();
    const now = Date.now();
    sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    )
      .run('default', 'did:plc:me', 'kosui.me', 'https://pds.example.net', 'access', 'refresh', now);
    sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
      .run(
        'at://did:plc:a/app.bsky.feed.post/1',
        'u',
        'cid1',
        'did:plc:a',
        'alice.bsky.social',
        'hi',
        '[]',
        now,
        now,
        now,
      );
    const fetchStub = (async () =>
      Response.json({
        feed: [{
          post: {
            uri: 'at://did:plc:a/app.bsky.feed.post/1',
            cid: 'cid1',
            author: { did: 'did:plc:a', handle: 'alice.bsky.social' },
            record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: new Date(now).toISOString() },
            indexedAt: new Date(now).toISOString(),
          },
        }],
        cursor: 'next',
      })) as unknown as typeof fetch;
    const env = { ...enabled, DB: binding } as unknown as IoriWorkerEnv;
    queries.length = 0;

    const result = await createCollectBlueskyTimelineUseCase(env, { fetch: fetchStub, holdLoginAfterFailure: true })
      ?.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 1, saved: 0, dropped: 0 } });
    expect(queries.map(({ sql }) => sql.trim().split(/\s+/)[0]!.toLowerCase())).toEqual(['select', 'select', 'select']);
  });
});

describe('ログイン失敗後の待ち時間', () => {
  const failingLogin = () => {
    const requests: string[] = [];
    const fetchStub = (async (url: string | URL | Request) => {
      requests.push(String(url));
      return Response.json({ error: 'AuthenticationRequired' }, { status: 401 });
    }) as typeof fetch;
    return { requests, fetchStub };
  };

  it('cron の取り込みは、createSession が失敗したら時刻を書き、次の実行では createSession を呼ばない', async () => {
    const { binding, sqlite } = createSqliteD1Fixture();
    const { requests, fetchStub } = failingLogin();
    const env = { ...enabled, DB: binding } as unknown as IoriWorkerEnv;

    const first = await createCollectBlueskyTimelineUseCase(env, { fetch: fetchStub, holdLoginAfterFailure: true })
      ?.run();
    const second = await createCollectBlueskyTimelineUseCase(env, { fetch: fetchStub, holdLoginAfterFailure: true })
      ?.run();

    expect(first?.ok).toBe(false);
    expect(second?.ok).toBe(false);
    expect(requests).toEqual(['https://bsky.social/xrpc/com.atproto.server.createSession']);
    expect(sqlite.prepare('SELECT scope FROM bluesky_login_failures').all()).toEqual([{ scope: 'timeline' }]);
  });
});

describe('createBlueskyTimelineRuntimePorts', () => {
  it('無効でも保存済みの行を読む resolver を持ち、取り込みは無効として扱う', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyTimelineRuntimePorts(
      { IORI_BLUESKY_TIMELINE: 'disabled' } as unknown as IoriWorkerEnv,
      db,
    );

    expect(ports.blueskyTimelineEnabled).toBe(false);
    expect(ports.blueskyTimelineItemsResolver.resolve).toBeTypeOf('function');
    expect(ports.replyToBlueskyPostUseCase).toBeUndefined();
    expect(ports.postToBlueskyUseCase).toBeUndefined();
    expect(ports.quoteBlueskyPostUseCase).toBeUndefined();
    expect(ports.markBlueskyNotificationsSeenUseCase).toBeUndefined();
    expect(ports.blueskySearch).toBeUndefined();
  });

  it('有効なときは取り込みを有効として扱う', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyTimelineRuntimePorts(enabled as unknown as IoriWorkerEnv, db);

    expect(ports.blueskyTimelineEnabled).toBe(true);
    expect(ports.replyToBlueskyPostUseCase?.run).toBeTypeOf('function');
    expect(ports.postToBlueskyUseCase?.run).toBeTypeOf('function');
    expect(ports.quoteBlueskyPostUseCase?.run).toBeTypeOf('function');
    expect(ports.markBlueskyNotificationsSeenUseCase?.run).toBeTypeOf('function');
    expect(ports.blueskySearch?.searchPosts).toBeTypeOf('function');
  });

  it('タイムラインが無効でも、認証情報があれば Bluesky への直接投稿を使える', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyTimelineRuntimePorts(
      {
        IORI_BLUESKY_TIMELINE: 'disabled',
        BLUESKY_IDENTIFIER: 'me.bsky.social',
        BLUESKY_APP_PASSWORD: 'pw',
      } as unknown as IoriWorkerEnv,
      db,
    );

    expect(ports.replyToBlueskyPostUseCase).toBeUndefined();
    expect(ports.postToBlueskyUseCase?.run).toBeTypeOf('function');
  });
});
