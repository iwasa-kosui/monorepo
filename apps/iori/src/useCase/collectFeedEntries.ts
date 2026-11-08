import { RA } from '@iwasa-kosui/result';

import { type ParsedFeedItem, parseFeed } from '../adaptor/feed/parseFeed.ts';
import type { SafeFetcher } from '../adaptor/http/safeFetch.ts';
import type { XApiClient } from '../adaptor/x/xApiClient.ts';
import {
  type FeedEntriesResolverByFeedSourceIdAndGuids,
  type FeedEntriesResolverByFetchedBefore,
  FeedEntry,
  type FeedEntryBookmarkCountUpdated,
  type FeedEntryBookmarkCountUpdatedStore,
  type FeedEntryCollected,
  type FeedEntryCollectedStore,
  type FeedEntryExpiredStore,
  type FeedEntryMaxGuidResolverByFeedSourceId,
} from '../domain/feedEntry/feedEntry.ts';
import {
  FeedSource,
  type FeedSourceExternalUserIdResolvedStore,
  type FeedSourceFetchedStore,
  type FeedSourceFetchFailedStore,
  type FeedSourceKind,
  type FeedSourcesResolverByEnabled,
} from '../domain/feedSource/feedSource.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { FeedItemFetcher } from './feedItemFetcher.ts';
import { createXUserItemsFetcher, X_USER_RETENTION_DAYS } from './fetchXUserItems.ts';
import type { UseCase } from './useCase.ts';

export const FEED_FETCH_CONCURRENCY = 4;
export const FEED_RETENTION_DAYS = 90;
const FETCH_OPTIONS = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3 } as const;
const EXPIRE_BATCH_SIZE = 100;
const EXPIRE_MAX_BATCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

type ExpireRule = Readonly<{
  days: number;
  kinds?: ReadonlyArray<FeedSourceKind>;
  excludedKinds?: ReadonlyArray<FeedSourceKind>;
}>;

const EXPIRE_RULES: ReadonlyArray<ExpireRule> = [
  { days: FEED_RETENTION_DAYS, excludedKinds: ['thoughtworks_radar', 'x_user'] },
  { days: X_USER_RETENTION_DAYS, kinds: ['x_user'] },
];

type Input = void;

type Ok = Readonly<{ sources: number; failed: number; collected: number; expired: number }>;

type Err = never;

export type CollectFeedEntriesUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  feedSourcesResolverByEnabled: FeedSourcesResolverByEnabled;
  feedEntriesResolverByFeedSourceIdAndGuids: FeedEntriesResolverByFeedSourceIdAndGuids;
  feedEntriesResolverByFetchedBefore: FeedEntriesResolverByFetchedBefore;
  feedSourceFetchedStore: FeedSourceFetchedStore;
  feedSourceFetchFailedStore: FeedSourceFetchFailedStore;
  feedEntryCollectedStore: FeedEntryCollectedStore;
  feedEntryBookmarkCountUpdatedStore: FeedEntryBookmarkCountUpdatedStore;
  feedEntryExpiredStore: FeedEntryExpiredStore;
  feedEntryMaxGuidResolverByFeedSourceId: FeedEntryMaxGuidResolverByFeedSourceId;
  feedSourceExternalUserIdResolvedStore: FeedSourceExternalUserIdResolvedStore;
  safeFetcher: SafeFetcher;
  xApiClient?: XApiClient;
  now: () => Instant;
}>;

const toInstant = (date: Date | null): Instant | null => {
  if (date === null) return null;
  const instant = Instant.of(date.getTime());
  return instant.ok ? instant.val : null;
};

const uniqueByGuid = (items: ReadonlyArray<ParsedFeedItem>): ParsedFeedItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.guid) && seen.add(item.guid));
};

export const runWithConcurrency = async <T>(
  items: ReadonlyArray<T>,
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const item = items[next++];
      if (item === undefined) return;
      await task(item);
    }
  });
  await Promise.all(workers);
};

const create = ({
  feedSourcesResolverByEnabled,
  feedEntriesResolverByFeedSourceIdAndGuids,
  feedEntriesResolverByFetchedBefore,
  feedSourceFetchedStore,
  feedSourceFetchFailedStore,
  feedEntryCollectedStore,
  feedEntryBookmarkCountUpdatedStore,
  feedEntryExpiredStore,
  feedEntryMaxGuidResolverByFeedSourceId,
  feedSourceExternalUserIdResolvedStore,
  safeFetcher,
  xApiClient,
  now,
}: Deps): CollectFeedEntriesUseCase => {
  const fetchRss: FeedItemFetcher = async (source) => {
    const headers: Record<string, string> = {};
    if (source.etag !== null) headers['If-None-Match'] = source.etag;
    if (source.lastModified !== null) headers['If-Modified-Since'] = source.lastModified;
    const fetched = await safeFetcher.fetchText(source.url, { ...FETCH_OPTIONS, headers });
    if (!fetched.ok) throw new Error(fetched.err.message);
    const { status, body, etag, lastModified } = fetched.val;
    const validators = { etag: etag ?? source.etag, lastModified: lastModified ?? source.lastModified };
    if (status === 304 || body === undefined) {
      return { source, items: [], retentionDays: FEED_RETENTION_DAYS, validators };
    }
    const parsed = parseFeed(body);
    if (!parsed.ok) throw new Error(parsed.err.message);
    return { source, items: parsed.val, retentionDays: FEED_RETENTION_DAYS, validators };
  };

  const fetchXUser: FeedItemFetcher | undefined = xApiClient === undefined ? undefined : createXUserItemsFetcher({
    xApiClient,
    feedEntryMaxGuidResolverByFeedSourceId,
    feedSourceExternalUserIdResolvedStore,
    now,
  });

  const fetcherOf = (kind: FeedSourceKind): FeedItemFetcher | undefined => {
    if (kind === 'thoughtworks_radar') return undefined;
    return kind === 'x_user' ? fetchXUser : fetchRss;
  };

  const collectSource = async (original: FeedSource, fetchItems: FeedItemFetcher): Promise<number> => {
    const { source, items: fetchedItems, retentionDays, validators } = await fetchItems(original);
    const retentionStart = Instant.addDuration(now(), -retentionDays * DAY_MS);
    const items = uniqueByGuid(fetchedItems).filter((item) =>
      item.publishedAt === null || item.publishedAt.getTime() >= retentionStart
    );
    const existing = await feedEntriesResolverByFeedSourceIdAndGuids.resolve({
      feedSourceId: source.feedSourceId,
      guids: items.map((item) => item.guid),
    });
    const existingByGuid = new Map(existing.val.map((entry) => [entry.guid, entry]));
    const collectedEvents: FeedEntryCollected[] = [];
    const updatedEvents: FeedEntryBookmarkCountUpdated[] = [];
    for (const item of items) {
      const entry = existingByGuid.get(item.guid);
      if (entry === undefined) {
        const collected = FeedEntry.collect({
          feedSourceId: source.feedSourceId,
          guid: item.guid,
          url: item.url,
          title: item.title,
          description: item.description,
          publishedAt: toInstant(item.publishedAt),
          hatenaBookmarkCount: item.hatenaBookmarkCount,
        }, now());
        if (collected.ok) collectedEvents.push(collected.val);
      } else if (item.hatenaBookmarkCount !== null && item.hatenaBookmarkCount !== entry.hatenaBookmarkCount) {
        updatedEvents.push(FeedEntry.updateBookmarkCount(entry, item.hatenaBookmarkCount, now()));
      }
    }
    if (collectedEvents.length > 0) await feedEntryCollectedStore.store(...collectedEvents);
    if (updatedEvents.length > 0) await feedEntryBookmarkCountUpdatedStore.store(...updatedEvents);
    await feedSourceFetchedStore.store(FeedSource.recordFetched(source, validators, now()));
    return collectedEvents.length;
  };

  const recordFailure = async (source: FeedSource, error: unknown): Promise<void> => {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await feedSourceFetchFailedStore.store(FeedSource.recordFetchFailed(source, message, now()));
    } catch (storeError) {
      console.error('iori feed: failed to record a fetch failure.', { url: source.url, error: storeError });
    }
  };

  const expireOldEntries = async (): Promise<number> => {
    let expired = 0;
    for (const rule of EXPIRE_RULES) {
      for (let batch = 0; batch < EXPIRE_MAX_BATCHES; batch += 1) {
        const timestamp = now();
        const resolved = await feedEntriesResolverByFetchedBefore.resolve({
          fetchedBefore: Instant.addDuration(timestamp, -rule.days * DAY_MS),
          limit: EXPIRE_BATCH_SIZE,
          kinds: rule.kinds,
          excludedKinds: rule.excludedKinds,
        });
        const entries = resolved.val;
        if (entries.length === 0) break;
        await feedEntryExpiredStore.store(...entries.map((entry) => FeedEntry.expire(entry, timestamp)));
        expired += entries.length;
        if (entries.length < EXPIRE_BATCH_SIZE) break;
      }
    }
    return expired;
  };

  const run = async (): RA<Ok, Err> => {
    const resolved = await feedSourcesResolverByEnabled.resolve({ enabled: true });
    const sources = resolved.val.filter((source) => fetcherOf(source.kind) !== undefined);
    let failed = 0;
    let collected = 0;
    await runWithConcurrency(sources, FEED_FETCH_CONCURRENCY, async (source) => {
      try {
        const fetchItems = fetcherOf(source.kind);
        if (fetchItems === undefined) return;
        const count = await collectSource(source, fetchItems);
        collected += count;
      } catch (error) {
        failed += 1;
        await recordFailure(source, error);
      }
    });
    const expired = await expireOldEntries();
    return RA.ok({ sources: sources.length, failed, collected, expired });
  };

  return { run };
};

export const CollectFeedEntriesUseCase = {
  create,
} as const;
