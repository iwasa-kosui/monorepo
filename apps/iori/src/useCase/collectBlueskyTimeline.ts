import { RA, Result } from '@iwasa-kosui/result';

import {
  BLUESKY_BOOKMARK_SYNC_GRACE_MS,
  type BlueskyBookmark,
  type BlueskyViewerBookmarksSyncedStore,
} from '../domain/blueskyTimeline/blueskyBookmark.ts';
import type { BlueskyLike, BlueskyViewerLikesSyncedStore } from '../domain/blueskyTimeline/blueskyLike.ts';
import {
  BLUESKY_REPOST_SYNC_GRACE_MS,
  type BlueskyRepost,
  type BlueskyViewerRepostsSyncedStore,
} from '../domain/blueskyTimeline/blueskyRepost.ts';
import {
  BLUESKY_TIMELINE_MAX_PAGES,
  BLUESKY_TIMELINE_PAGE_LIMIT,
  BLUESKY_TIMELINE_RETENTION_DAYS,
  type BlueskyFetchedTimelineItem,
  type BlueskyTimelineExistingFeedItemIdsResolver,
  type BlueskyTimelineItemsSavedStore,
} from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyTimelineFetcher } from '../ports/blueskyTimelineFetcher.ts';
import type { UseCase } from './useCase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

type Input = void;

type Ok = Readonly<{ pages: number; fetched: number; saved: number; dropped: number }>;

type Err = BlueskyClientError;

export type CollectBlueskyTimelineUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  fetcher: BlueskyTimelineFetcher;
  existingResolver: BlueskyTimelineExistingFeedItemIdsResolver;
  savedStore: BlueskyTimelineItemsSavedStore;
  viewerLikesStore: BlueskyViewerLikesSyncedStore;
  viewerRepostsStore: BlueskyViewerRepostsSyncedStore;
  viewerBookmarksStore: BlueskyViewerBookmarksSyncedStore;
  now: () => Instant;
}>;

const uniqueByFeedItemId = (items: readonly BlueskyFetchedTimelineItem[]): BlueskyFetchedTimelineItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.feedItemId) && seen.add(item.feedItemId));
};

const syncViewerLikes = async (
  store: BlueskyViewerLikesSyncedStore,
  items: readonly BlueskyFetchedTimelineItem[],
): Promise<void> => {
  const likes = new Map<string, BlueskyLike>();
  for (const item of items) {
    if (item.viewerLikeUri === null || likes.has(item.uri)) continue;
    likes.set(item.uri, { subjectUri: item.uri, likeUri: item.viewerLikeUri, createdAt: item.fetchedAt });
  }
  if (likes.size === 0) return;
  Result.unsafeUnwrap(await store.sync([...likes.values()]));
};

const syncViewerReposts = async (
  store: BlueskyViewerRepostsSyncedStore,
  items: readonly BlueskyFetchedTimelineItem[],
  staleBefore: Instant,
): Promise<void> => {
  const reposts = new Map<string, BlueskyRepost>();
  const unreposted = new Set<string>();
  for (const item of items) {
    if (item.viewerRepostUri === null) {
      unreposted.add(item.uri);
      continue;
    }
    if (reposts.has(item.uri)) continue;
    reposts.set(item.uri, { subjectUri: item.uri, repostUri: item.viewerRepostUri, createdAt: item.fetchedAt });
  }
  if (reposts.size > 0) Result.unsafeUnwrap(await store.sync([...reposts.values()]));
  const absent = [...unreposted].filter((uri) => !reposts.has(uri));
  if (absent.length > 0) Result.unsafeUnwrap(await store.deleteStale(absent, staleBefore));
};

const syncViewerBookmarks = async (
  store: BlueskyViewerBookmarksSyncedStore,
  items: readonly BlueskyFetchedTimelineItem[],
  staleBefore: Instant,
): Promise<void> => {
  const bookmarks = new Map<string, BlueskyBookmark>();
  const unbookmarked = new Set<string>();
  for (const item of items) {
    if (!item.bookmarked) {
      if (item.bookmarkUnknown !== true) unbookmarked.add(item.uri);
      continue;
    }
    if (bookmarks.has(item.uri)) continue;
    bookmarks.set(item.uri, { subjectUri: item.uri, createdAt: item.fetchedAt });
  }
  if (bookmarks.size > 0) Result.unsafeUnwrap(await store.sync([...bookmarks.values()]));
  const absent = [...unbookmarked].filter((uri) => !bookmarks.has(uri));
  if (absent.length > 0) Result.unsafeUnwrap(await store.deleteStale(absent, staleBefore));
};

const create = (
  { fetcher, existingResolver, savedStore, viewerLikesStore, viewerRepostsStore, viewerBookmarksStore, now }: Deps,
): CollectBlueskyTimelineUseCase => {
  const run = async (): RA<Ok, Err> => {
    const startedAt = now();
    const retentionStart = Instant.addDuration(startedAt, -BLUESKY_TIMELINE_RETENTION_DAYS * DAY_MS);
    const repostStaleBefore = Instant.addDuration(startedAt, -BLUESKY_REPOST_SYNC_GRACE_MS);
    const bookmarkStaleBefore = Instant.addDuration(startedAt, -BLUESKY_BOOKMARK_SYNC_GRACE_MS);
    let cursor: string | undefined;
    let failure: Err | undefined;
    let pages = 0;
    let fetched = 0;
    let saved = 0;
    let dropped = 0;
    while (pages < BLUESKY_TIMELINE_MAX_PAGES) {
      const page = await fetcher.fetch({ limit: BLUESKY_TIMELINE_PAGE_LIMIT, cursor });
      if (!page.ok) {
        failure = page.err;
        break;
      }
      pages += 1;
      dropped += page.val.dropped;
      const unique = uniqueByFeedItemId(page.val.items);
      const recent = unique.filter((item) => item.indexedAt >= retentionStart);
      fetched += recent.length;
      const existing = new Set(
        Result.unsafeUnwrap(await existingResolver.resolve(recent.map((item) => item.feedItemId))),
      );
      const added = recent.filter((item) => !existing.has(item.feedItemId));
      const inserted = added.length === 0 ? [] : Result.unsafeUnwrap(await savedStore.save(added));
      saved += inserted.length;
      await syncViewerLikes(viewerLikesStore, recent);
      await syncViewerReposts(viewerRepostsStore, recent, repostStaleBefore);
      await syncViewerBookmarks(viewerBookmarksStore, recent, bookmarkStaleBefore);
      cursor = page.val.cursor;
      if (inserted.length < recent.length || recent.length < unique.length || cursor === undefined) break;
    }
    return failure === undefined ? RA.ok({ pages, fetched, saved, dropped }) : RA.err(failure);
  };

  return { run };
};

export const CollectBlueskyTimelineUseCase = {
  create,
} as const;
