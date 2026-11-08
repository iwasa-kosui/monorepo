import { RA } from '@iwasa-kosui/result';

import type { TwitterApiIoClient } from '../adaptor/twitterApiIo/twitterApiIoClient.ts';
import type { FeedEntryMaxGuidResolverByFeedSourceId } from '../domain/feedEntry/feedEntry.ts';
import {
  type FeedSource,
  FeedSourceFetchCooldownError,
  type FeedSourceFetchReserver,
  type FeedSourcesResolverByEnabled,
  X_MANUAL_FETCH_COOLDOWN_SECONDS,
  X_MANUAL_FETCH_MAX_SOURCES,
} from '../domain/feedSource/feedSource.ts';
import { createFeedSourceCollector, runWithConcurrency } from './collectFeedEntries.ts';
import { createXUserItemsFetcher } from './fetchXUserItems.ts';
import type { UseCase } from './useCase.ts';

type Input = void;

type Ok = Readonly<{ sources: number; failed: number; collected: number }>;

type Err = FeedSourceFetchCooldownError;

export type RefreshXPostsUseCase = UseCase<Input, Ok, Err>;

type CollectorDeps = Parameters<typeof createFeedSourceCollector>[0];

type Deps =
  & CollectorDeps
  & Readonly<{
    feedSourcesResolverByEnabled: FeedSourcesResolverByEnabled;
    feedSourceFetchReserver: FeedSourceFetchReserver;
    feedEntryMaxGuidResolverByFeedSourceId: FeedEntryMaxGuidResolverByFeedSourceId;
    twitterApiIoClient: TwitterApiIoClient;
  }>;

const COOLDOWN_MS = X_MANUAL_FETCH_COOLDOWN_SECONDS * 1000;

const fetchedAtOf = (source: FeedSource): number => source.lastFetchedAt ?? Number.MIN_SAFE_INTEGER;

const byLeastRecentlyFetched = (a: FeedSource, b: FeedSource): number => fetchedAtOf(a) - fetchedAtOf(b);

const create = (deps: Deps): RefreshXPostsUseCase => {
  const { feedSourcesResolverByEnabled, feedSourceFetchReserver, feedEntryMaxGuidResolverByFeedSourceId, now } = deps;
  const { collectSource, recordFailure } = createFeedSourceCollector(deps);
  const fetchXUser = createXUserItemsFetcher({
    twitterApiIoClient: deps.twitterApiIoClient,
    feedEntryMaxGuidResolverByFeedSourceId,
    now,
  });

  const run = async (): RA<Ok, Err> => {
    const requestedAt = now();
    const resolved = await feedSourcesResolverByEnabled.resolve({ enabled: true });
    const xUsers = resolved.val.filter((source) => source.kind === 'x_user');
    if (xUsers.length === 0) return RA.ok({ sources: 0, failed: 0, collected: 0 });

    const isReady = (source: FeedSource): boolean => fetchedAtOf(source) + COOLDOWN_MS <= requestedAt;
    const ready = xUsers.filter(isReady);
    const cooling = xUsers.filter((source) => !isReady(source));
    const selected = [...ready].sort(byLeastRecentlyFetched).slice(0, X_MANUAL_FETCH_MAX_SOURCES);
    const reserved: FeedSource[] = [];
    for (const source of selected) {
      const reservation = await feedSourceFetchReserver.reserve({
        feedSourceId: source.feedSourceId,
        now: requestedAt,
      });
      if (reservation.val) reserved.push(source);
    }
    if (reserved.length === 0) {
      const soonest = cooling.length === 0 ? undefined : Math.min(...cooling.map(fetchedAtOf)) + COOLDOWN_MS;
      return RA.err(FeedSourceFetchCooldownError.create(
        soonest === undefined
          ? X_MANUAL_FETCH_COOLDOWN_SECONDS
          : Math.max(1, Math.ceil((soonest - requestedAt) / 1000)),
      ));
    }

    let failed = 0;
    let collected = 0;
    await runWithConcurrency(reserved, 1, async (source) => {
      try {
        collected += await collectSource(source, fetchXUser);
      } catch (error) {
        failed += 1;
        await recordFailure(source, error);
      }
    });
    return RA.ok({ sources: reserved.length, failed, collected });
  };

  return { run };
};

export const RefreshXPostsUseCase = { create } as const;
