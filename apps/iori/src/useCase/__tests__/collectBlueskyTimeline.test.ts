import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyTimelineItemsExpiredStore } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsExpiredStore.ts';
import { createD1BlueskyTimelineItemsResolver } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1BlueskyTimelineItemsSavedStore } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsSavedStore.ts';
import { BlueskyFetchedTimelineItem } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyTimelineFetcher, BlueskyTimelinePage } from '../../ports/blueskyTimelineFetcher.ts';
import { CollectBlueskyTimelineUseCase } from '../collectBlueskyTimeline.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 12));

const itemAt = (
  n: number,
  indexedAt: number,
  overrides: Partial<BlueskyFetchedTimelineItem> = {},
): BlueskyFetchedTimelineItem =>
  BlueskyFetchedTimelineItem.orThrow({
    feedItemId: `at://did:plc:a/app.bsky.feed.post/${n}`,
    uri: `at://did:plc:a/app.bsky.feed.post/${n}`,
    cid: `cid${n}`,
    authorDid: 'did:plc:a',
    authorHandle: 'alice.bsky.social',
    authorDisplayName: 'Alice',
    authorAvatar: null,
    text: `post ${n}`,
    facets: [],
    embed: null,
    replyParentUri: null,
    replyParentAuthorHandle: null,
    repostedByDid: null,
    repostedByHandle: null,
    postedAt: Instant.orThrow(indexedAt - 1000),
    indexedAt: Instant.orThrow(indexedAt),
    fetchedAt: NOW,
    liked: false,
    viewerLikeUri: null,
    ...overrides,
  });

const pageOf = (items: BlueskyFetchedTimelineItem[], cursor: string | undefined, dropped = 0): BlueskyTimelinePage => ({
  items,
  cursor,
  dropped,
});

const setup = (pages: ReadonlyArray<BlueskyTimelinePage | BlueskyClientError>) => {
  const { db, sqlite, queries } = createSqliteD1Fixture();
  const queue = [...pages];
  const fetch = vi.fn(async (_input: { limit: number; cursor: string | undefined }) => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected fetch');
    return 'type' in next ? RA.err(next) : RA.ok(next);
  });
  const fetcher: BlueskyTimelineFetcher = { fetch };
  const useCase = CollectBlueskyTimelineUseCase.create({
    fetcher,
    savedStore: createD1BlueskyTimelineItemsSavedStore(db),
    expiredStore: createD1BlueskyTimelineItemsExpiredStore(db),
    now: () => NOW,
  });
  const stored = () =>
    sqlite.prepare('SELECT feedItemId FROM bluesky_timeline_items ORDER BY feedItemId').all().map((row) =>
      (row as { feedItemId: string }).feedItemId
    );
  const enqueue = (...next: Array<BlueskyTimelinePage | BlueskyClientError>) => queue.push(...next);
  return { db, sqlite, queries, fetch, useCase, stored, enqueue };
};

const recent = (n: number) => itemAt(n, NOW - n * 1000);

describe('CollectBlueskyTimelineUseCase', () => {
  it('1 ページ目の cursor が無ければ 1 ページで止め、保存して件数を返す', async () => {
    const t = setup([pageOf([recent(1), recent(2)], undefined, 1)]);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 2, saved: 2, dropped: 1 } });
    expect(t.fetch).toHaveBeenCalledWith({ limit: 100, cursor: undefined });
    expect(t.stored()).toEqual([recent(1).feedItemId, recent(2).feedItemId]);
  });

  it('取得済みの feedItemId に当たったページで止め、そのページの新しい投稿は保存する', async () => {
    const t = setup([pageOf([recent(1), recent(2)], undefined)]);
    await t.useCase.run();
    t.enqueue(
      pageOf([recent(6), recent(1), recent(7)], 'next'),
      pageOf([recent(8)], undefined),
    );
    t.fetch.mockClear();

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 3, saved: 2, dropped: 0 } });
    expect(t.fetch).toHaveBeenCalledOnce();
    expect(t.stored()).toEqual([1, 2, 6, 7].map((n) => recent(n).feedItemId).toSorted());
  });

  it('最大 5 ページで止まり、cursor を引き継ぐ', async () => {
    const pages = [1, 2, 3, 4, 5, 6].map((n) => pageOf([recent(n)], `c${n}`));
    const t = setup(pages);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { pages: 5, fetched: 5, saved: 5, dropped: 0 } });
    expect(t.fetch.mock.calls.map(([input]) => input.cursor)).toEqual([undefined, 'c1', 'c2', 'c3', 'c4']);
    expect(t.stored()).toHaveLength(5);
  });

  it('1 ページに同じ feedItemId が重なっても 1 件だけ保存する', async () => {
    const t = setup([pageOf([recent(1), recent(1)], undefined)]);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { fetched: 1, saved: 1 } });
  });

  it('保持期限（30 日）より古い行を削除し、古い投稿は保存せずそこで遡るのを止める', async () => {
    const t = setup([
      pageOf([recent(1), itemAt(2, NOW - 31 * DAY), itemAt(3, NOW - 32 * DAY)], 'c1'),
      pageOf([recent(4)], undefined),
    ]);
    t.sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run('old', 'old', 'c', 'did', 'h', 't', '[]', 1, NOW - 30 * DAY - 1, 1);
    t.sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run('edge', 'edge', 'c', 'did', 'h', 't', '[]', 1, NOW - 30 * DAY, 1);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 1, saved: 1, dropped: 0 } });
    expect(t.stored()).toEqual(['edge', recent(1).feedItemId].toSorted());
    expect(t.fetch).toHaveBeenCalledOnce();
  });

  it('取得に失敗したらエラーを返すが、それまでに保存した分は残し、期限切れの削除も行う', async () => {
    const error: BlueskyClientError = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'app.bsky.feed.getTimeline failed: status 500',
      status: 500,
    };
    const t = setup([pageOf([recent(1)], 'c1'), error]);
    t.sqlite.prepare(
      'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run('old', 'old', 'c', 'did', 'h', 't', '[]', 1, 1, 1);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: false, err: error });
    expect(t.stored()).toEqual([recent(1).feedItemId]);
  });

  it('保存した行を、投稿の形に戻して読める（facets・embed・リポスト・返信）', async () => {
    const rich = itemAt(9, NOW - 1000, {
      feedItemId: 'at://did:plc:a/app.bsky.feed.post/9#repost:did:plc:b',
      uri: 'at://did:plc:a/app.bsky.feed.post/9',
      text: '日本語 https://example.com',
      facets: [{ byteStart: 10, byteEnd: 29, feature: { type: 'link', uri: 'https://example.com' } }],
      embed: {
        type: 'recordWithMedia',
        media: { type: 'external', uri: 'https://example.com', title: 't', description: 'd', thumb: null },
        record: { type: 'record', uri: 'at://did:plc:q/app.bsky.feed.post/1', authorHandle: 'q.example', text: 'q' },
      },
      replyParentUri: 'at://did:plc:p/app.bsky.feed.post/0',
      replyParentAuthorHandle: 'p.example',
      repostedByDid: 'did:plc:b',
      repostedByHandle: 'bob.example',
    });
    const t = setup([pageOf([rich], undefined)]);
    await t.useCase.run();

    const resolved = await createD1BlueskyTimelineItemsResolver(t.db).resolve({ limit: 10, before: undefined });

    const { viewerLikeUri: _viewerLikeUri, ...expected } = rich;
    expect(resolved).toEqual({ ok: true, val: [expected] });
  });

  describe('viewer.like', () => {
    const likeRows = (t: ReturnType<typeof setup>) =>
      t.sqlite.prepare('SELECT subjectUri, likeUri, createdAt FROM bluesky_likes ORDER BY subjectUri').all();
    const likeUri = (n: number) => `at://did:plc:me/app.bsky.feed.like/3k${n}`;

    it('新しく保存した行に viewerLikeUri があれば bluesky_likes に保存し、liked として読める', async () => {
      const liked = itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(1) });
      const t = setup([pageOf([liked, recent(2)], undefined)]);

      await t.useCase.run();

      expect(likeRows(t)).toEqual([{ subjectUri: liked.uri, likeUri: likeUri(1), createdAt: NOW }]);
      const resolved = Result.unsafeUnwrap(
        await createD1BlueskyTimelineItemsResolver(t.db).resolve({ limit: 10, before: undefined }),
      );
      expect(resolved.map((item) => [item.uri, item.liked])).toEqual([[liked.uri, true], [recent(2).uri, false]]);
    });

    it('同じ uri の通常の行と repost の行がどちらも viewerLikeUri を持っていても 1 行だけ保存する', async () => {
      const plain = itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(1) });
      const repost = itemAt(1, NOW - 2000, {
        feedItemId: `${plain.uri}#repost:did:plc:b`,
        repostedByDid: 'did:plc:b',
        repostedByHandle: 'bob.example',
        liked: true,
        viewerLikeUri: likeUri(1),
      });
      const t = setup([pageOf([plain, repost], undefined)]);

      await t.useCase.run();

      expect(likeRows(t)).toHaveLength(1);
    });

    it('viewerLikeUri が無い投稿だけのときは bluesky_likes への INSERT を発行しない', async () => {
      const t = setup([pageOf([recent(1), recent(2)], undefined)]);

      await t.useCase.run();

      expect(t.queries.some(({ sql }) => sql.includes('bluesky_likes'))).toBe(false);
    });

    it('すでに保存済みの行は、viewerLikeUri があっても bluesky_likes を書き換えない', async () => {
      const t = setup([pageOf([recent(1)], undefined)]);
      await t.useCase.run();
      t.enqueue(pageOf([itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(1) })], undefined));

      await t.useCase.run();

      expect(likeRows(t)).toEqual([]);
    });
  });
});
