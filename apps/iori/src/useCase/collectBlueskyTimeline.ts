import { RA, Result } from '@iwasa-kosui/result';

import type { BlueskyLike, BlueskyViewerLikesSyncedStore } from '../domain/blueskyTimeline/blueskyLike.ts';
import {
  BLUESKY_TIMELINE_MAX_PAGES,
  BLUESKY_TIMELINE_PAGE_LIMIT,
  BLUESKY_TIMELINE_RETENTION_DAYS,
  type BlueskyFetchedTimelineItem,
  type BlueskyTimelineItemsExpiredStore,
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
  savedStore: BlueskyTimelineItemsSavedStore;
  expiredStore: BlueskyTimelineItemsExpiredStore;
  viewerLikesStore: BlueskyViewerLikesSyncedStore;
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

const create = ({ fetcher, savedStore, expiredStore, viewerLikesStore, now }: Deps): CollectBlueskyTimelineUseCase => {
  const run = async (): RA<Ok, Err> => {
    const retentionStart = Instant.addDuration(now(), -BLUESKY_TIMELINE_RETENTION_DAYS * DAY_MS);
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
      const inserted = Result.unsafeUnwrap(await savedStore.save(recent));
      saved += inserted.length;
      await syncViewerLikes(viewerLikesStore, recent);
      cursor = page.val.cursor;
      if (inserted.length < recent.length || recent.length < unique.length || cursor === undefined) break;
    }
    Result.unsafeUnwrap(await expiredStore.expire(retentionStart));
    return failure === undefined ? RA.ok({ pages, fetched, saved, dropped }) : RA.err(failure);
  };

  return { run };
};

export const CollectBlueskyTimelineUseCase = {
  create,
} as const;
