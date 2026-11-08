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

describe('createBlueskyTimelineRuntimePorts', () => {
  it('無効でも保存済みの行を読む resolver を持ち、取り込み用の use case は持たない', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyTimelineRuntimePorts(
      { IORI_BLUESKY_TIMELINE: 'disabled' } as unknown as IoriWorkerEnv,
      db,
    );

    expect(ports.collectBlueskyTimelineUseCase).toBeUndefined();
    expect(ports.blueskyTimelineItemsResolver.resolve).toBeTypeOf('function');
  });
});
