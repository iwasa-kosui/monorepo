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
export const BOOKMARK_COUNT_MAX_REQUESTS_PER_RUN = 3;
export const BOOKMARK_COUNT_URLS_PER_REQUEST = 50;
export const BOOKMARK_COUNT_MAX_ENTRIES = BOOKMARK_COUNT_MAX_REQUESTS_PER_RUN * BOOKMARK_COUNT_URLS_PER_REQUEST;
export const BOOKMARK_COUNT_MAX_REQUEST_URL_LENGTH = 8_000;
export const BOOKMARK_COUNT_MAX_TARGET_URL_LENGTH = 2_000;
export const BOOKMARK_COUNT_REQUEST_INTERVAL_MS = 3_000;
const FETCH_OPTIONS = { timeoutMs: 10_000, maxBytes: 256 * 1024, maxRedirects: 3 } as const;
const EXCLUDED_KINDS: ReadonlyArray<FeedSourceKind> = ['hatena_hotentry', 'hatena_entrylist', 'thoughtworks_radar'];
const DAY_MS = 24 * 60 * 60 * 1000;

const countsZodType = z.record(z.string(), z.number().int().nonnegative());

type Input = void;

type Ok = Readonly<{ requested: number; updated: number; failedRequests: number; skipped: number }>;

type Err = never;

export type RefreshHatenaBookmarkCountsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  feedEntriesResolverByFetchedSinceExcludingKinds: FeedEntriesResolverByFetchedSinceExcludingKinds;
  feedEntryBookmarkCountUpdatedStore: FeedEntryBookmarkCountUpdatedStore;
  safeFetcher: SafeFetcher;
  sleep: (ms: number) => Promise<void>;
  now: () => Instant;
}>;

const PARAM_PREFIX = 'url=';
const REQUEST_URL_PREFIX_LENGTH = `${BOOKMARK_COUNT_ENDPOINT}?`.length;

const encodedLength = (url: string): number => encodeURIComponent(url).length;

const splitIntoBatches = (urls: ReadonlyArray<string>): string[][] => {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const url of urls) {
    const paramLength = PARAM_PREFIX.length + encodedLength(url);
    const joinedLength = current.length === 0 ? paramLength : currentLength + 1 + paramLength;
    const full = current.length >= BOOKMARK_COUNT_URLS_PER_REQUEST
      || REQUEST_URL_PREFIX_LENGTH + joinedLength > BOOKMARK_COUNT_MAX_REQUEST_URL_LENGTH;
    if (current.length > 0 && full) {
      batches.push(current);
      current = [url];
      currentLength = paramLength;
    } else {
      current.push(url);
      currentLength = joinedLength;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
};

const buildCountUrl = (urls: ReadonlyArray<string>): string =>
  `${BOOKMARK_COUNT_ENDPOINT}?${urls.map((url) => `${PARAM_PREFIX}${encodeURIComponent(url)}`).join('&')}`;

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
    const targetUrls = [...entriesByUrl.keys()].filter((url) =>
      encodedLength(url) <= BOOKMARK_COUNT_MAX_TARGET_URL_LENGTH
    );
    const batches = splitIntoBatches(targetUrls).slice(0, BOOKMARK_COUNT_MAX_REQUESTS_PER_RUN);
    const requested = batches.reduce((total, urls) => total + urls.length, 0);
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
    return RA.ok({ requested, updated, failedRequests, skipped: entriesByUrl.size - requested });
  };

  return { run };
};

export const RefreshHatenaBookmarkCountsUseCase = {
  create,
} as const;
