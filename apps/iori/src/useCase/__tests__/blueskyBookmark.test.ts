import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyBookmarkDeletedStore } from '../../adaptor/d1/blueskyTimeline/blueskyBookmarkDeletedStore.ts';
import { createD1BlueskyBookmarkSavedStore } from '../../adaptor/d1/blueskyTimeline/blueskyBookmarkSavedStore.ts';
import { createD1BlueskyBookmarkTargetResolver } from '../../adaptor/d1/blueskyTimeline/blueskyBookmarkTargetResolver.ts';
import { createD1BlueskyViewerBookmarksSyncedStore } from '../../adaptor/d1/blueskyTimeline/blueskyViewerBookmarksSyncedStore.ts';
import { BlueskyFetchedTimelineItem } from '../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyBookmarkReader, BlueskyBookmarksPage } from '../../ports/blueskyBookmarkReader.ts';
import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../../ports/blueskyPostCidResolver.ts';
import { BookmarkBlueskyPostUseCase } from '../bookmarkBlueskyPost.ts';
import { ListBlueskyBookmarksUseCase } from '../listBlueskyBookmarks.ts';
import { UnbookmarkBlueskyPostUseCase } from '../unbookmarkBlueskyPost.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12, 12));
const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const REPOST = `${POST}#repost:did:plc:b`;
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'createBookmark failed: status 500',
  status: 500,
};

const setup = () => {
  const { db, sqlite } = createSqliteD1Fixture();
  const insertItem = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  insertItem.run(POST, POST, 'bafypost', 'did:plc:a', 'alice.bsky.social', 't', '[]', null, 1, 1, 1);
  insertItem.run(REPOST, POST, 'bafypost', 'did:plc:a', 'alice.bsky.social', 't', '[]', 'did:plc:b', 1, 1, 1);
  const createBookmark = vi.fn<BlueskyClient['createBookmark']>(async () => RA.ok(undefined));
  const deleteBookmark = vi.fn<BlueskyClient['deleteBookmark']>(async () => RA.ok(undefined));
  const targetResolver = createD1BlueskyBookmarkTargetResolver(db);
  const resolveCid = vi.fn<BlueskyPostCidResolver['resolve']>(async (uri) =>
    RA.ok(uri === POST ? { cid: 'bafyfresh', likeUri: null, repostUri: null } : undefined)
  );
  const bookmark = BookmarkBlueskyPostUseCase.create({
    client: { createBookmark },
    targetResolver,
    cidResolver: { resolve: resolveCid },
    savedStore: createD1BlueskyBookmarkSavedStore(db),
    now: () => NOW,
  });
  const unbookmark = UnbookmarkBlueskyPostUseCase.create({
    client: { deleteBookmark },
    targetResolver,
    deletedStore: createD1BlueskyBookmarkDeletedStore(db),
  });
  const bookmarks = () => sqlite.prepare('SELECT subjectUri, createdAt FROM bluesky_bookmarks').all();
  const seedBookmark = () =>
    sqlite.prepare('INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)').run(POST, 1);
  return { bookmark, unbookmark, createBookmark, deleteBookmark, resolveCid, bookmarks, seedBookmark };
};

describe('BookmarkBlueskyPostUseCase', () => {
  it('未知の feedItemId は NotFound にし、Bluesky を呼ばない', async () => {
    const t = setup();

    const result = await t.bookmark.run({ feedItemId: 'unknown' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyBookmarkTargetNotFound' } });
    expect(t.createBookmark).not.toHaveBeenCalled();
    expect(t.bookmarks()).toEqual([]);
  });

  it('feedItemId の uri と cid を行から取って Bluesky に作成し、成功してから bluesky_bookmarks に保存する', async () => {
    const t = setup();

    const result = await t.bookmark.run({ feedItemId: POST });

    expect(result).toEqual({ ok: true, val: { bookmarked: true } });
    expect(t.createBookmark).toHaveBeenCalledExactlyOnceWith({ uri: POST, cid: 'bafypost' });
    expect(t.resolveCid).not.toHaveBeenCalled();
    expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: NOW }]);
  });

  it('リポストの feedItemId でも元の投稿の uri を保存する', async () => {
    const t = setup();

    const result = await t.bookmark.run({ feedItemId: REPOST });

    expect(result.ok).toBe(true);
    expect(t.createBookmark).toHaveBeenCalledExactlyOnceWith({ uri: POST, cid: 'bafypost' });
    expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: NOW }]);
  });

  it('uri の指定では cid を Bluesky から解決して作成する', async () => {
    const t = setup();

    const result = await t.bookmark.run({ uri: POST });

    expect(result).toEqual({ ok: true, val: { bookmarked: true } });
    expect(t.resolveCid).toHaveBeenCalledExactlyOnceWith(POST);
    expect(t.createBookmark).toHaveBeenCalledExactlyOnceWith({ uri: POST, cid: 'bafyfresh' });
    expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: NOW }]);
  });

  it('uri の投稿が Bluesky に無いときは NotFound にする', async () => {
    const t = setup();

    const result = await t.bookmark.run({ uri: 'at://did:plc:a/app.bsky.feed.post/missing' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyBookmarkTargetNotFound' } });
    expect(t.createBookmark).not.toHaveBeenCalled();
  });

  it('cid の解決に失敗したら、その失敗を返して作成しない', async () => {
    const t = setup();
    t.resolveCid.mockReturnValueOnce(RA.err(failure));

    const result = await t.bookmark.run({ uri: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.createBookmark).not.toHaveBeenCalled();
  });

  it('Bluesky への作成に失敗したら保存せずにその失敗を返す', async () => {
    const t = setup();
    t.createBookmark.mockReturnValueOnce(RA.err(failure));

    const result = await t.bookmark.run({ feedItemId: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.bookmarks()).toEqual([]);
  });

  it('保存済みでも Bluesky に作成し、行を増やさない', async () => {
    const t = setup();
    t.seedBookmark();

    const result = await t.bookmark.run({ feedItemId: POST });

    expect(result).toEqual({ ok: true, val: { bookmarked: true } });
    expect(t.createBookmark).toHaveBeenCalledOnce();
    expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: 1 }]);
  });
});

describe('UnbookmarkBlueskyPostUseCase', () => {
  it('未知の feedItemId は NotFound にし、Bluesky を呼ばない', async () => {
    const t = setup();

    const result = await t.unbookmark.run({ feedItemId: 'unknown' });

    expect(result).toEqual({ ok: false, err: { type: 'BlueskyBookmarkTargetNotFound' } });
    expect(t.deleteBookmark).not.toHaveBeenCalled();
  });

  it('feedItemId の投稿の uri で Bluesky から削除し、成功してから行を消す', async () => {
    const t = setup();
    t.seedBookmark();

    const result = await t.unbookmark.run({ feedItemId: REPOST });

    expect(result).toEqual({ ok: true, val: { bookmarked: false } });
    expect(t.deleteBookmark).toHaveBeenCalledExactlyOnceWith(POST);
    expect(t.bookmarks()).toEqual([]);
  });

  it('uri の指定では、そのまま Bluesky から削除して行を消す', async () => {
    const t = setup();
    t.seedBookmark();

    const result = await t.unbookmark.run({ uri: POST });

    expect(result).toEqual({ ok: true, val: { bookmarked: false } });
    expect(t.deleteBookmark).toHaveBeenCalledExactlyOnceWith(POST);
    expect(t.bookmarks()).toEqual([]);
  });

  it('Bluesky からの削除に失敗したら行を残し、その失敗を返す', async () => {
    const t = setup();
    t.seedBookmark();
    t.deleteBookmark.mockReturnValueOnce(RA.err(failure));

    const result = await t.unbookmark.run({ uri: POST });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: 1 }]);
  });
});

describe('ListBlueskyBookmarksUseCase', () => {
  const itemOf = (n: number): BlueskyFetchedTimelineItem =>
    BlueskyFetchedTimelineItem.orThrow({
      feedItemId: `at://did:plc:a/app.bsky.feed.post/${n}`,
      uri: `at://did:plc:a/app.bsky.feed.post/${n}`,
      cid: `cid${n}`,
      authorDid: 'did:plc:a',
      authorHandle: 'alice.bsky.social',
      authorDisplayName: null,
      authorAvatar: null,
      text: `post ${n}`,
      facets: [],
      embed: null,
      replyParentUri: null,
      replyParentAuthorHandle: null,
      repostedByDid: null,
      repostedByHandle: null,
      postedAt: NOW,
      indexedAt: NOW,
      fetchedAt: NOW,
      liked: false,
      viewerLikeUri: null,
      reposted: false,
      viewerRepostUri: null,
      bookmarked: true,
      threadMuted: false,
      replyRootUri: null,
    });
  const page: BlueskyBookmarksPage = { items: [itemOf(1), itemOf(2), itemOf(1)], cursor: 'next' };

  const listSetup = (getBookmarks: BlueskyBookmarkReader['getBookmarks']) => {
    const { db, sqlite } = createSqliteD1Fixture();
    const viewerBookmarksStore = createD1BlueskyViewerBookmarksSyncedStore(db);
    const useCase = ListBlueskyBookmarksUseCase.create({ reader: { getBookmarks }, viewerBookmarksStore });
    const rows = () => sqlite.prepare('SELECT subjectUri, createdAt FROM bluesky_bookmarks ORDER BY subjectUri').all();
    return { useCase, viewerBookmarksStore, rows, sqlite };
  };

  it('reader に cursor を渡し、ページをそのまま返す', async () => {
    const getBookmarks = vi.fn<BlueskyBookmarkReader['getBookmarks']>(async () => RA.ok(page));
    const t = listSetup(getBookmarks);

    const result = await t.useCase.run({ cursor: 'c1' });

    expect(result).toEqual({ ok: true, val: page });
    expect(getBookmarks).toHaveBeenCalledExactlyOnceWith({ cursor: 'c1' });
  });

  it('取得したページの uri を重複なく bluesky_bookmarks に追加し、保存済みの行は書き直さない', async () => {
    const t = listSetup(async () => RA.ok(page));
    t.sqlite.prepare('INSERT INTO bluesky_bookmarks(subjectUri,createdAt) VALUES (?,?)').run(itemOf(2).uri, 5);

    await t.useCase.run({ cursor: undefined });

    expect(t.rows()).toEqual([{ subjectUri: itemOf(1).uri, createdAt: NOW }, {
      subjectUri: itemOf(2).uri,
      createdAt: 5,
    }]);
  });

  it('ミラーの保存に失敗しても、ページを返す', async () => {
    const t = listSetup(async () => RA.ok(page));
    vi.spyOn(t.viewerBookmarksStore, 'sync').mockRejectedValueOnce(new Error('d1 down'));

    expect(await t.useCase.run({ cursor: undefined })).toEqual({ ok: true, val: page });
  });

  it('reader の失敗をそのまま返し、ミラーに書かない', async () => {
    const t = listSetup(async () => RA.err(failure));

    expect(await t.useCase.run({ cursor: undefined })).toEqual({ ok: false, err: failure });
    expect(t.rows()).toEqual([]);
  });
});
