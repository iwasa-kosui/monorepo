import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyTimelineExistingFeedItemIdsResolver } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineExistingFeedItemIdsResolver.ts';
import { createD1BlueskyTimelineItemsResolver } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createD1BlueskyTimelineItemsSavedStore } from '../../adaptor/d1/blueskyTimeline/blueskyTimelineItemsSavedStore.ts';
import { createD1BlueskyViewerBookmarksSyncedStore } from '../../adaptor/d1/blueskyTimeline/blueskyViewerBookmarksSyncedStore.ts';
import { createD1BlueskyViewerLikesSyncedStore } from '../../adaptor/d1/blueskyTimeline/blueskyViewerLikesSyncedStore.ts';
import { createD1BlueskyViewerRepostsSyncedStore } from '../../adaptor/d1/blueskyTimeline/blueskyViewerRepostsSyncedStore.ts';
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
    reposted: false,
    viewerRepostUri: null,
    bookmarked: false,
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
  const savedStore = createD1BlueskyTimelineItemsSavedStore(db);
  const save = vi.spyOn(savedStore, 'save');
  const useCase = CollectBlueskyTimelineUseCase.create({
    fetcher,
    existingResolver: createD1BlueskyTimelineExistingFeedItemIdsResolver(db),
    savedStore,
    viewerLikesStore: createD1BlueskyViewerLikesSyncedStore(db),
    viewerRepostsStore: createD1BlueskyViewerRepostsSyncedStore(db),
    viewerBookmarksStore: createD1BlueskyViewerBookmarksSyncedStore(db),
    now: () => NOW,
  });
  const stored = () =>
    sqlite.prepare('SELECT feedItemId FROM bluesky_timeline_items ORDER BY feedItemId').all().map((row) =>
      (row as { feedItemId: string }).feedItemId
    );
  const enqueue = (...next: Array<BlueskyTimelinePage | BlueskyClientError>) => queue.push(...next);
  return { db, sqlite, queries, fetch, save, useCase, stored, enqueue };
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

  it('保持期限（30 日）より古い投稿は保存せず、そこで遡るのを止める', async () => {
    const t = setup([
      pageOf([recent(1), itemAt(2, NOW - 31 * DAY), itemAt(3, NOW - 32 * DAY)], 'c1'),
      pageOf([recent(4)], undefined),
    ]);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 1, saved: 1, dropped: 0 } });
    expect(t.stored()).toEqual([recent(1).feedItemId]);
    expect(t.fetch).toHaveBeenCalledOnce();
  });

  it('取得に失敗したらエラーを返すが、それまでに保存した分は残す', async () => {
    const error: BlueskyClientError = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'app.bsky.feed.getTimeline failed: status 500',
      status: 500,
    };
    const t = setup([pageOf([recent(1)], 'c1'), error]);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: false, err: error });
    expect(t.stored()).toEqual([recent(1).feedItemId]);
  });

  it('新しい投稿がないときは、書き込みのストアを呼ばず、INSERT・UPDATE・DELETE を 1 本も発行しない', async () => {
    const t = setup([pageOf([recent(1), recent(2)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([recent(1), recent(2)], 'next'), pageOf([recent(3)], undefined));
    t.save.mockClear();
    t.queries.length = 0;

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 2, saved: 0, dropped: 0 } });
    expect(t.save).not.toHaveBeenCalled();
    expect(t.queries).toHaveLength(3);
    expect(t.queries.every(({ sql }) => /^select /i.test(sql))).toBe(true);
    expect(t.queries.filter(({ sql }) => /^\s*(insert|update|delete)\b/i.test(sql))).toEqual([]);
    expect(t.stored()).toEqual([recent(1).feedItemId, recent(2).feedItemId]);
  });

  it('一部だけ新しいときは新しい行だけを保存し、次のページを読まない', async () => {
    const t = setup([pageOf([recent(1), recent(2)], undefined)]);
    await t.useCase.run();
    t.enqueue(pageOf([recent(3), recent(1), recent(4), recent(2)], 'next'), pageOf([recent(5)], undefined));
    t.save.mockClear();
    t.fetch.mockClear();

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { pages: 1, fetched: 4, saved: 2, dropped: 0 } });
    expect(t.save).toHaveBeenCalledOnce();
    expect(t.save.mock.calls[0]![0].map((item) => item.feedItemId)).toEqual([
      recent(3).feedItemId,
      recent(4).feedItemId,
    ]);
    expect(t.fetch).toHaveBeenCalledOnce();
    expect(t.stored()).toEqual([1, 2, 3, 4].map((n) => recent(n).feedItemId));
  });

  it('全部が新しいページでは次のページへ進み、既存の確認は 1 ページにつき SELECT 1 本で済む', async () => {
    const t = setup([
      pageOf([1, 2, 3].map(recent), 'c1'),
      pageOf([4, 5].map(recent), undefined),
    ]);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { pages: 2, fetched: 5, saved: 5 } });
    expect(
      t.queries.filter(({ sql }) =>
        /^\s*select /i.test(sql) && !sql.includes('bluesky_reposts') && !sql.includes('bluesky_bookmarks')
      ),
    ).toHaveLength(2);
  });

  it('保存済みの feedItemId の確認は D1 のバインド数の上限（100）を超えない', async () => {
    const t = setup([pageOf(Array.from({ length: 100 }, (_, i) => recent(i + 1)), undefined)]);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { fetched: 100, saved: 100 } });
    expect(t.stored()).toHaveLength(100);
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

    const { viewerLikeUri: _viewerLikeUri, viewerRepostUri: _viewerRepostUri, ...expected } = rich;
    expect(resolved).toEqual({ ok: true, val: [expected] });
  });

  describe('viewer.like', () => {
    const likeRows = (t: ReturnType<typeof setup>) =>
      t.sqlite.prepare('SELECT subjectUri, likeUri, createdAt FROM bluesky_likes ORDER BY subjectUri').all();
    const likeUri = (n: number) => `at://did:plc:me/app.bsky.feed.like/3k${n}`;
    const likeQueries = (t: ReturnType<typeof setup>) =>
      t.queries.filter(({ sql }) => sql.includes('bluesky_likes')).map(({ sql }) =>
        sql.trim().split(/\s/)[0]?.toLowerCase()
      );

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

    it('取り込み済みの投稿の viewerLikeUri も保存する', async () => {
      const t = setup([pageOf([recent(1)], undefined)]);
      await t.useCase.run();
      t.enqueue(pageOf([itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(1) })], undefined));

      await t.useCase.run();

      expect(likeRows(t)).toEqual([{ subjectUri: recent(1).uri, likeUri: likeUri(1), createdAt: NOW }]);
    });

    it('保存済みの likeUri と同じなら、bluesky_likes に書き込まない', async () => {
      const liked = itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(1) });
      const t = setup([pageOf([liked], undefined)]);
      await t.useCase.run();
      t.enqueue(pageOf([liked], undefined));
      t.queries.length = 0;

      await t.useCase.run();

      expect(likeQueries(t)).toEqual(['select']);
      expect(likeRows(t)).toEqual([{ subjectUri: liked.uri, likeUri: likeUri(1), createdAt: NOW }]);
    });

    it('保存済みの likeUri と違えば、likeUri を更新する', async () => {
      const t = setup([pageOf([itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(1) })], undefined)]);
      await t.useCase.run();
      t.enqueue(pageOf([itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(2) })], undefined));
      t.queries.length = 0;

      await t.useCase.run();

      expect(likeQueries(t)).toEqual(['select', 'insert']);
      expect(likeRows(t)).toEqual([{ subjectUri: recent(1).uri, likeUri: likeUri(2), createdAt: NOW }]);
    });

    it('viewerLikeUri が無い項目では、保存済みの bluesky_likes の行を消さない', async () => {
      const t = setup([pageOf([itemAt(1, NOW - 1000, { liked: true, viewerLikeUri: likeUri(1) })], undefined)]);
      await t.useCase.run();
      t.enqueue(pageOf([itemAt(1, NOW - 1000)], undefined));

      await t.useCase.run();

      expect(likeRows(t)).toEqual([{ subjectUri: recent(1).uri, likeUri: likeUri(1), createdAt: NOW }]);
    });

    it('保持期限より古い項目の viewerLikeUri は保存しない', async () => {
      const old = itemAt(1, NOW - 31 * DAY, { liked: true, viewerLikeUri: likeUri(1) });
      const t = setup([pageOf([recent(2), old], undefined)]);

      await t.useCase.run();

      expect(likeRows(t)).toEqual([]);
    });

    it('viewerLikeUri を持つ項目が無いページでは、bluesky_likes への SELECT も INSERT も発行しない', async () => {
      const t = setup([pageOf([recent(1), recent(2)], undefined)]);

      await t.useCase.run();

      expect(likeQueries(t)).toEqual([]);
    });

    it('同じページの 100 件がすべて新しい viewerLikeUri でも D1 のバインド上限に当たらない', async () => {
      const items = Array.from(
        { length: 100 },
        (_, n) => itemAt(n, NOW - 1000, { liked: true, viewerLikeUri: likeUri(n) }),
      );
      const t = setup([pageOf(items, undefined)]);

      await t.useCase.run();

      expect(likeRows(t)).toHaveLength(100);
    });
  });

  describe('viewer.repost', () => {
    const repostRows = (t: ReturnType<typeof setup>) =>
      t.sqlite.prepare('SELECT subjectUri, repostUri, createdAt FROM bluesky_reposts ORDER BY subjectUri').all();
    const repostUri = (n: number) => `at://did:plc:me/app.bsky.feed.repost/3k${n}`;
    const repostQueries = (t: ReturnType<typeof setup>) =>
      t.queries.filter(({ sql }) => sql.includes('bluesky_reposts')).map(({ sql }) =>
        sql.trim().split(/\s/)[0]?.toLowerCase()
      );

    it('新しく保存した行に viewerRepostUri があれば bluesky_reposts に保存し、reposted として読める', async () => {
      const reposted = itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(1) });
      const t = setup([pageOf([reposted, recent(2)], undefined)]);

      await t.useCase.run();

      expect(repostRows(t)).toEqual([{ subjectUri: reposted.uri, repostUri: repostUri(1), createdAt: NOW }]);
      const resolved = Result.unsafeUnwrap(
        await createD1BlueskyTimelineItemsResolver(t.db).resolve({ limit: 10, before: undefined }),
      );
      expect(resolved.map((item) => [item.uri, item.reposted])).toEqual([[reposted.uri, true], [recent(2).uri, false]]);
    });

    it('同じ uri の通常の行と repost の行がどちらも viewerRepostUri を持っていても 1 行だけ保存する', async () => {
      const plain = itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(1) });
      const repostRow = itemAt(1, NOW - 2000, {
        feedItemId: `${plain.uri}#repost:did:plc:b`,
        repostedByDid: 'did:plc:b',
        repostedByHandle: 'bob.example',
        reposted: true,
        viewerRepostUri: repostUri(1),
        bookmarked: false,
      });
      const t = setup([pageOf([plain, repostRow], undefined)]);

      await t.useCase.run();

      expect(repostRows(t)).toHaveLength(1);
    });

    it('取り込み済みの投稿の viewerRepostUri も保存する', async () => {
      const t = setup([pageOf([recent(1)], undefined)]);
      await t.useCase.run();
      t.enqueue(pageOf([itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(1) })], undefined));

      await t.useCase.run();

      expect(repostRows(t)).toEqual([{ subjectUri: recent(1).uri, repostUri: repostUri(1), createdAt: NOW }]);
    });

    it('保存済みの repostUri と同じなら、bluesky_reposts に書き込まない', async () => {
      const reposted = itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(1) });
      const t = setup([pageOf([reposted], undefined)]);
      await t.useCase.run();
      t.enqueue(pageOf([reposted], undefined));
      t.queries.length = 0;

      await t.useCase.run();

      expect(repostQueries(t)).toEqual(['select']);
      expect(repostRows(t)).toEqual([{ subjectUri: reposted.uri, repostUri: repostUri(1), createdAt: NOW }]);
    });

    it('保存済みの repostUri と違えば、repostUri を更新する', async () => {
      const t = setup([
        pageOf([itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(1) })], undefined),
      ]);
      await t.useCase.run();
      t.enqueue(pageOf([itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(2) })], undefined));
      t.queries.length = 0;

      await t.useCase.run();

      expect(repostQueries(t)).toEqual(['select', 'insert']);
      expect(repostRows(t)).toEqual([{ subjectUri: recent(1).uri, repostUri: repostUri(2), createdAt: NOW }]);
    });

    it('viewerRepostUri が無い項目では、保存済みの bluesky_reposts の行を消さない', async () => {
      const t = setup([
        pageOf([itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(1) })], undefined),
      ]);
      await t.useCase.run();
      t.enqueue(pageOf([itemAt(1, NOW - 1000)], undefined));

      await t.useCase.run();

      expect(repostRows(t)).toEqual([{ subjectUri: recent(1).uri, repostUri: repostUri(1), createdAt: NOW }]);
    });

    it('保持期限より古い項目の viewerRepostUri は保存しない', async () => {
      const old = itemAt(1, NOW - 31 * DAY, { reposted: true, viewerRepostUri: repostUri(1) });
      const t = setup([pageOf([recent(2), old], undefined)]);

      await t.useCase.run();

      expect(repostRows(t)).toEqual([]);
    });

    it('viewerRepostUri を持つ項目が無く、保存済みの行も無いページでは、bluesky_reposts への SELECT だけを発行する', async () => {
      const t = setup([pageOf([recent(1), recent(2)], undefined)]);

      await t.useCase.run();

      expect(repostQueries(t)).toEqual(['select']);
    });

    describe('別クライアントで取り消したリポストの削除', () => {
      const MINUTE = 60 * 1000;
      const seedRepost = (t: ReturnType<typeof setup>, n: number, createdAt: number) =>
        t.sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)').run(
          recent(n).uri,
          repostUri(n),
          createdAt,
        );

      it('viewerRepostUri が無い投稿の、取得開始の 5 分より前の行を消す', async () => {
        const t = setup([pageOf([recent(1)], undefined)]);
        seedRepost(t, 1, NOW - 5 * MINUTE - 1);

        await t.useCase.run();

        expect(repostRows(t)).toEqual([]);
      });

      it('取得開始から 5 分以内の行は消さない', async () => {
        const t = setup([pageOf([recent(1), recent(2)], undefined)]);
        seedRepost(t, 1, NOW - 4 * MINUTE);
        seedRepost(t, 2, NOW - 5 * MINUTE);

        await t.useCase.run();

        expect(repostRows(t)).toEqual([
          { subjectUri: recent(1).uri, repostUri: repostUri(1), createdAt: NOW - 4 * MINUTE },
          { subjectUri: recent(2).uri, repostUri: repostUri(2), createdAt: NOW - 5 * MINUTE },
        ]);
      });

      it('viewerRepostUri がある投稿の古い行は消さず、repostUri を同期する', async () => {
        const t = setup([
          pageOf([itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(9) })], undefined),
        ]);
        seedRepost(t, 1, NOW - 10 * MINUTE);

        await t.useCase.run();

        expect(repostRows(t)).toEqual([
          { subjectUri: recent(1).uri, repostUri: repostUri(9), createdAt: NOW - 10 * MINUTE },
        ]);
      });

      it('同じ uri の通常の行と repost の行の片方だけが viewerRepostUri を持つときは消さない', async () => {
        const plain = itemAt(1, NOW - 1000);
        const repostRow = itemAt(1, NOW - 2000, {
          feedItemId: `${plain.uri}#repost:did:plc:b`,
          repostedByDid: 'did:plc:b',
          repostedByHandle: 'bob.example',
          reposted: true,
          viewerRepostUri: repostUri(1),
          bookmarked: false,
        });
        const t = setup([pageOf([plain, repostRow], undefined)]);
        seedRepost(t, 1, NOW - 10 * MINUTE);

        await t.useCase.run();

        expect(repostRows(t)).toEqual([
          { subjectUri: plain.uri, repostUri: repostUri(1), createdAt: NOW - 10 * MINUTE },
        ]);
      });

      it('viewerRepostUri がある投稿と無い投稿が混在するときは、無い投稿の古い行だけを消す', async () => {
        const reposted = itemAt(1, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(1) });
        const t = setup([pageOf([reposted, recent(2), recent(3)], undefined)]);
        seedRepost(t, 1, NOW - 10 * MINUTE);
        seedRepost(t, 2, NOW - 10 * MINUTE);
        seedRepost(t, 3, NOW - MINUTE);
        seedRepost(t, 4, NOW - 10 * MINUTE);

        await t.useCase.run();

        expect(repostRows(t).map((row) => (row as { subjectUri: string }).subjectUri)).toEqual([
          recent(1).uri,
          recent(3).uri,
          recent(4).uri,
        ]);
      });

      it('削除対象の行が無ければ、DELETE を発行しない', async () => {
        const t = setup([pageOf([recent(1), recent(2)], undefined)]);
        seedRepost(t, 1, NOW - MINUTE);
        t.queries.length = 0;

        await t.useCase.run();

        expect(repostQueries(t)).toEqual(['select']);
      });

      it('削除対象があれば SELECT と DELETE を 1 本ずつ発行する', async () => {
        const t = setup([pageOf([recent(1)], undefined)]);
        seedRepost(t, 1, NOW - 10 * MINUTE);
        t.queries.length = 0;

        await t.useCase.run();

        expect(repostQueries(t)).toEqual(['select', 'delete']);
      });

      it('同じページの 100 件がすべて viewerRepostUri なしでも D1 のバインド上限に当たらない', async () => {
        const items = Array.from({ length: 100 }, (_, n) => itemAt(n, NOW - 1000));
        const t = setup([pageOf(items, undefined)]);
        for (let n = 0; n < 100; n += 1) {
          t.sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)').run(
            items[n]!.uri,
            repostUri(n),
            NOW - 10 * MINUTE,
          );
        }

        await t.useCase.run();

        expect(repostRows(t)).toEqual([]);
      });
    });

    it('同じページの 100 件がすべて新しい viewerRepostUri でも D1 のバインド上限に当たらない', async () => {
      const items = Array.from(
        { length: 100 },
        (_, n) => itemAt(n, NOW - 1000, { reposted: true, viewerRepostUri: repostUri(n) }),
      );
      const t = setup([pageOf(items, undefined)]);

      await t.useCase.run();

      expect(repostRows(t)).toHaveLength(100);
    });
  });
  describe('viewer.bookmarked', () => {
    const MINUTE = 60 * 1000;
    const bookmarkRows = (t: ReturnType<typeof setup>) =>
      t.sqlite.prepare('SELECT subjectUri, createdAt FROM bluesky_bookmarks ORDER BY subjectUri').all();
    const bookmarkQueries = (t: ReturnType<typeof setup>) =>
      t.queries.filter(({ sql }) => sql.includes('bluesky_bookmarks')).map(({ sql }) =>
        sql.trim().split(/\s/)[0]?.toLowerCase()
      );
    const seedBookmark = (t: ReturnType<typeof setup>, n: number, createdAt: number) =>
      t.sqlite.prepare('INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)').run(
        recent(n).uri,
        createdAt,
      );

    it('bookmarked の項目の uri を bluesky_bookmarks に保存し、bookmarked として読める', async () => {
      const t = setup([pageOf([recent(1), itemAt(2, NOW - 2000, { bookmarked: true })], undefined)]);

      await t.useCase.run();

      expect(bookmarkRows(t)).toEqual([{ subjectUri: recent(2).uri, createdAt: NOW }]);
      const resolver = createD1BlueskyTimelineItemsResolver(t.db);
      const items = Result.unsafeUnwrap(await resolver.resolve({ limit: 10, before: undefined }));
      expect(items.map((item) => [item.feedItemId, item.bookmarked])).toEqual([
        [recent(1).feedItemId, false],
        [recent(2).feedItemId, true],
      ]);
    });

    it('同じ uri の通常の行と repost の行が両方 bookmarked でも 1 行だけ保存する', async () => {
      const t = setup([
        pageOf([
          itemAt(1, NOW - 1000, { bookmarked: true }),
          itemAt(1, NOW - 2000, {
            feedItemId: 'at://did:plc:a/app.bsky.feed.post/1#repost:did:plc:b',
            repostedByDid: 'did:plc:b',
            repostedByHandle: 'bob.example',
            bookmarked: true,
          }),
        ], undefined),
      ]);

      await t.useCase.run();

      expect(bookmarkRows(t)).toEqual([{ subjectUri: recent(1).uri, createdAt: NOW }]);
    });

    it('保存済みの uri は書き直さない', async () => {
      const t = setup([pageOf([itemAt(1, NOW - 1000, { bookmarked: true })], undefined)]);
      seedBookmark(t, 1, 5);
      t.queries.length = 0;

      await t.useCase.run();

      expect(bookmarkRows(t)).toEqual([{ subjectUri: recent(1).uri, createdAt: 5 }]);
      expect(bookmarkQueries(t)).toEqual(['select']);
    });

    it('bookmarked でない投稿の、取得開始の 5 分より前の行を消す', async () => {
      const t = setup([pageOf([recent(1), recent(2)], undefined)]);
      seedBookmark(t, 1, NOW - 10 * MINUTE);
      seedBookmark(t, 2, NOW - MINUTE);
      t.queries.length = 0;

      await t.useCase.run();

      expect(bookmarkRows(t)).toEqual([{ subjectUri: recent(2).uri, createdAt: NOW - MINUTE }]);
      expect(bookmarkQueries(t)).toEqual(['select', 'delete']);
    });

    it('bookmarked の投稿の古い行は消さない', async () => {
      const t = setup([pageOf([itemAt(1, NOW - 1000, { bookmarked: true })], undefined)]);
      seedBookmark(t, 1, NOW - 10 * MINUTE);

      await t.useCase.run();

      expect(bookmarkRows(t)).toEqual([{ subjectUri: recent(1).uri, createdAt: NOW - 10 * MINUTE }]);
    });

    it('同じ uri の通常の行と repost の行の片方だけが bookmarked のときは消さない', async () => {
      const t = setup([
        pageOf([
          itemAt(1, NOW - 1000, { bookmarked: true }),
          itemAt(1, NOW - 2000, {
            feedItemId: 'at://did:plc:a/app.bsky.feed.post/1#repost:did:plc:b',
            repostedByDid: 'did:plc:b',
            repostedByHandle: 'bob.example',
          }),
        ], undefined),
      ]);
      seedBookmark(t, 1, NOW - 10 * MINUTE);

      await t.useCase.run();

      expect(bookmarkRows(t)).toHaveLength(1);
    });

    it('削除対象が無いページでは bluesky_bookmarks への SELECT だけを発行する', async () => {
      const t = setup([pageOf([recent(1), recent(2)], undefined)]);

      await t.useCase.run();

      expect(bookmarkQueries(t)).toEqual(['select']);
    });

    it('同じページの 100 件がすべて bookmarked でも、すべて bookmarked でなくても D1 のバインド上限に当たらない', async () => {
      const bookmarked = Array.from({ length: 100 }, (_, n) => itemAt(n, NOW - 1000, { bookmarked: true }));
      const t = setup([pageOf(bookmarked, undefined)]);

      const first = await t.useCase.run();
      t.enqueue(pageOf(bookmarked.map((item) => ({ ...item, bookmarked: false })), undefined));
      const second = await t.useCase.run();

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(bookmarkRows(t)).toHaveLength(100);
    });
  });
});
