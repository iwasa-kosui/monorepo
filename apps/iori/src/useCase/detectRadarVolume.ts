import { RA } from '@iwasa-kosui/result';

import { parseRadarVolume } from '../adaptor/feed/parseRadarVolume.ts';
import type { SafeFetcher } from '../adaptor/http/safeFetch.ts';
import {
  type FeedEntriesResolverByFeedSourceIdAndGuids,
  FeedEntry,
  type FeedEntryCollectedStore,
} from '../domain/feedEntry/feedEntry.ts';
import {
  FeedSource,
  type FeedSourceFetchedStore,
  type FeedSourceFetchFailedStore,
  type FeedSourcesResolverByEnabled,
} from '../domain/feedSource/feedSource.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

const FETCH_OPTIONS = { timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024, maxRedirects: 3 } as const;

type Input = void;

type Ok = Readonly<{ sources: number; failed: number; collected: number }>;

type Err = never;

export type DetectRadarVolumeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  feedSourcesResolverByEnabled: FeedSourcesResolverByEnabled;
  feedEntriesResolverByFeedSourceIdAndGuids: FeedEntriesResolverByFeedSourceIdAndGuids;
  feedSourceFetchedStore: FeedSourceFetchedStore;
  feedSourceFetchFailedStore: FeedSourceFetchFailedStore;
  feedEntryCollectedStore: FeedEntryCollectedStore;
  safeFetcher: SafeFetcher;
  now: () => Instant;
}>;

const create = ({
  feedSourcesResolverByEnabled,
  feedEntriesResolverByFeedSourceIdAndGuids,
  feedSourceFetchedStore,
  feedSourceFetchFailedStore,
  feedEntryCollectedStore,
  safeFetcher,
  now,
}: Deps): DetectRadarVolumeUseCase => {
  const detectSource = async (source: FeedSource): Promise<number> => {
    const headers: Record<string, string> = {};
    if (source.etag !== null) headers['If-None-Match'] = source.etag;
    if (source.lastModified !== null) headers['If-Modified-Since'] = source.lastModified;
    const fetched = await safeFetcher.fetchText(source.url, { ...FETCH_OPTIONS, headers });
    if (!fetched.ok) throw new Error(fetched.err.message);
    const { status, body, etag, lastModified } = fetched.val;
    const validators = { etag: etag ?? source.etag, lastModified: lastModified ?? source.lastModified };
    if (status === 304 || body === undefined) {
      await feedSourceFetchedStore.store(FeedSource.recordFetched(source, validators, now()));
      return 0;
    }
    const parsed = parseRadarVolume(body);
    if (!parsed.ok) throw new Error(parsed.err.message);
    const { volume, year, month, pdfUrl } = parsed.val;
    const guid = `thoughtworks-radar-vol-${volume}`;
    const existing = await feedEntriesResolverByFeedSourceIdAndGuids.resolve({
      feedSourceId: source.feedSourceId,
      guids: [guid],
    });
    let collected = 0;
    if (existing.val.length === 0) {
      const publishedAt = Instant.of(Date.UTC(year, month - 1, 1));
      if (!publishedAt.ok) throw new Error(publishedAt.err.message);
      const event = FeedEntry.collect({
        feedSourceId: source.feedSourceId,
        guid,
        url: pdfUrl,
        title: `Thoughtworks Technology Radar Vol ${volume}`,
        description: '',
        publishedAt: publishedAt.val,
        hatenaBookmarkCount: null,
      }, now());
      if (!event.ok) throw new Error(event.err.message);
      await feedEntryCollectedStore.store(event.val);
      collected = 1;
    }
    await feedSourceFetchedStore.store(FeedSource.recordFetched(source, validators, now()));
    return collected;
  };

  const recordFailure = async (source: FeedSource, error: unknown): Promise<void> => {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await feedSourceFetchFailedStore.store(FeedSource.recordFetchFailed(source, message, now()));
    } catch (storeError) {
      console.error('iori radar: failed to record a fetch failure.', { url: source.url, error: storeError });
    }
  };

  const run = async (): RA<Ok, Err> => {
    const resolved = await feedSourcesResolverByEnabled.resolve({ enabled: true });
    const sources = resolved.val.filter((source) => source.kind === 'thoughtworks_radar');
    let failed = 0;
    let collected = 0;
    for (const source of sources) {
      try {
        collected += await detectSource(source);
      } catch (error) {
        failed += 1;
        await recordFailure(source, error);
      }
    }
    return RA.ok({ sources: sources.length, failed, collected });
  };

  return { run };
};

export const DetectRadarVolumeUseCase = {
  create,
} as const;
