import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { SafeFetcher } from '../adaptor/http/safeFetch.ts';
import {
  type FeedEntriesResolverByFetchedSinceExcludingKinds,
  FeedEntry,
  type FeedEntryBookmarkCountUpdatedStore,
} from '../domain/feedEntry/feedEntry.ts';
import type { FeedSourceKind } from '../domain/feedSource/feedSource.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

export const BOOKMARK_COUNT_ENDPOINT = 'https://bookmark.hatenaapis.com/count/entries';
export const BOOKMARK_COUNT_TARGET_DAYS = 3;
export const BOOKMARK_COUNT_MAX_ENTRIES = 150;
export const BOOKMARK_COUNT_BATCH_SIZE = 50;
export const BOOKMARK_COUNT_REQUEST_INTERVAL_MS = 3_000;
const FETCH_OPTIONS = { timeoutMs: 10_000, maxBytes: 256 * 1024, maxRedirects: 3 } as const;
const EXCLUDED_KINDS: ReadonlyArray<FeedSourceKind> = ['hatena_hotentry', 'hatena_entrylist', 'thoughtworks_radar'];
const DAY_MS = 24 * 60 * 60 * 1000;

const countsZodType = z.record(z.string(), z.number().int().nonnegative());

type Input = void;

type Ok = Readonly<{ requested: number; updated: number; failedRequests: number }>;

type Err = never;

export type RefreshHatenaBookmarkCountsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  feedEntriesResolverByFetchedSinceExcludingKinds: FeedEntriesResolverByFetchedSinceExcludingKinds;
  feedEntryBookmarkCountUpdatedStore: FeedEntryBookmarkCountUpdatedStore;
  safeFetcher: SafeFetcher;
  sleep: (ms: number) => Promise<void>;
  now: () => Instant;
}>;

const chunk = <T>(items: ReadonlyArray<T>, size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const buildCountUrl = (urls: ReadonlyArray<string>): string =>
  `${BOOKMARK_COUNT_ENDPOINT}?${urls.map((url) => `url=${encodeURIComponent(url)}`).join('&')}`;

const create = ({
  feedEntriesResolverByFetchedSinceExcludingKinds,
  feedEntryBookmarkCountUpdatedStore,
  safeFetcher,
  sleep,
  now,
}: Deps): RefreshHatenaBookmarkCountsUseCase => {
  const run = async (): RA<Ok, Err> => {
    const resolved = await feedEntriesResolverByFetchedSinceExcludingKinds.resolve({
      fetchedSince: Instant.addDuration(now(), -BOOKMARK_COUNT_TARGET_DAYS * DAY_MS),
      excludedKinds: EXCLUDED_KINDS,
      limit: BOOKMARK_COUNT_MAX_ENTRIES,
    });
    const entriesByUrl = new Map<string, FeedEntry[]>();
    for (const entry of resolved.val) {
      entriesByUrl.set(entry.url, [...(entriesByUrl.get(entry.url) ?? []), entry]);
    }
    const batches = chunk([...entriesByUrl.keys()], BOOKMARK_COUNT_BATCH_SIZE);
    let updated = 0;
    let failedRequests = 0;
    for (const [index, urls] of batches.entries()) {
      if (index > 0) await sleep(BOOKMARK_COUNT_REQUEST_INTERVAL_MS);
      try {
        const fetched = await safeFetcher.fetchText(buildCountUrl(urls), FETCH_OPTIONS);
        if (!fetched.ok) throw new Error(fetched.err.message);
        if (fetched.val.body === undefined) throw new Error(`empty response (status ${fetched.val.status})`);
        const counts = countsZodType.parse(JSON.parse(fetched.val.body));
        const events = urls.flatMap((url) => {
          const count = counts[url];
          if (count === undefined) return [];
          return (entriesByUrl.get(url) ?? [])
            .filter((entry) => entry.hatenaBookmarkCount !== count)
            .map((entry) => FeedEntry.updateBookmarkCount(entry, count, now()));
        });
        if (events.length > 0) await feedEntryBookmarkCountUpdatedStore.store(...events);
        updated += events.length;
      } catch (error) {
        failedRequests += 1;
        console.error('iori hatena: failed to refresh bookmark counts.', {
          urls: urls.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return RA.ok({ requested: entriesByUrl.size, updated, failedRequests });
  };

  return { run };
};

export const RefreshHatenaBookmarkCountsUseCase = {
  create,
} as const;
