import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1FeedEntriesResolverByFeedSourceIdAndGuids } from '../adaptor/d1/feedEntry/feedEntriesResolverByFeedSourceIdAndGuids.ts';
import { createD1FeedEntriesResolverByFetchedBefore } from '../adaptor/d1/feedEntry/feedEntriesResolverByFetchedBefore.ts';
import { createD1FeedEntriesResolverByFetchedSinceExcludingKinds } from '../adaptor/d1/feedEntry/feedEntriesResolverByFetchedSinceExcludingKinds.ts';
import { createD1FeedEntryBookmarkCountUpdatedStore } from '../adaptor/d1/feedEntry/feedEntryBookmarkCountUpdatedStore.ts';
import { createD1FeedEntryCollectedStore } from '../adaptor/d1/feedEntry/feedEntryCollectedStore.ts';
import { createD1FeedEntryExpiredStore } from '../adaptor/d1/feedEntry/feedEntryExpiredStore.ts';
import { createD1AllFeedSourcesResolver } from '../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceFetchedStore } from '../adaptor/d1/feedSource/feedSourceFetchedStore.ts';
import { createD1FeedSourceFetchFailedStore } from '../adaptor/d1/feedSource/feedSourceFetchFailedStore.ts';
import { createD1FeedSourcesResolverByEnabled } from '../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import { createSafeFetcher } from '../adaptor/http/safeFetch.ts';
import { Instant } from '../domain/instant/instant.ts';
import { CollectFeedEntriesUseCase } from '../useCase/collectFeedEntries.ts';
import { DetectRadarVolumeUseCase } from '../useCase/detectRadarVolume.ts';
import { EnsureDefaultFeedSourcesUseCase } from '../useCase/ensureDefaultFeedSources.ts';
import { RefreshHatenaBookmarkCountsUseCase } from '../useCase/refreshHatenaBookmarkCounts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createFeedUseCases = (env: IoriWorkerEnv) => {
  const db = createD1Db(env.DB);
  const now = Instant.now;
  return {
    ensureDefaultFeedSources: EnsureDefaultFeedSourcesUseCase.create({
      allFeedSourcesResolver: createD1AllFeedSourcesResolver(db),
      feedSourceCreatedStore: createD1FeedSourceCreatedStore(db),
      now,
    }),
    collectFeedEntries: CollectFeedEntriesUseCase.create({
      feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
      feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
      feedEntriesResolverByFetchedBefore: createD1FeedEntriesResolverByFetchedBefore(db),
      feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
      feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
      feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
      feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
      feedEntryExpiredStore: createD1FeedEntryExpiredStore(db),
      safeFetcher: createSafeFetcher(),
      now,
    }),
    detectRadarVolume: DetectRadarVolumeUseCase.create({
      feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
      feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
      feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
      feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
      feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
      safeFetcher: createSafeFetcher(),
      now,
    }),
    refreshHatenaBookmarkCounts: RefreshHatenaBookmarkCountsUseCase.create({
      feedEntriesResolverByFetchedSinceExcludingKinds: createD1FeedEntriesResolverByFetchedSinceExcludingKinds(db),
      feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
      safeFetcher: createSafeFetcher(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now,
    }),
  } as const;
};

export const collectFeedsTask: ScheduledTask = {
  name: 'collectFeeds',
  run: async ({ env }) => {
    const useCases = createFeedUseCases(env);
    await useCases.ensureDefaultFeedSources.run();
    const summary = await useCases.collectFeedEntries.run();
    console.info('iori feeds collected.', summary.val);
  },
};

export const refreshHatenaBookmarkCountsTask: ScheduledTask = {
  name: 'refreshHatenaBookmarkCounts',
  run: async ({ env }) => {
    const summary = await createFeedUseCases(env).refreshHatenaBookmarkCounts.run();
    console.info('iori hatena bookmark counts refreshed.', summary.val);
  },
};

export const detectRadarVolumeTask: ScheduledTask = {
  name: 'detectRadarVolume',
  run: async ({ env }) => {
    const useCases = createFeedUseCases(env);
    await useCases.ensureDefaultFeedSources.run();
    const summary = await useCases.detectRadarVolume.run();
    console.info('iori radar volume detected.', summary.val);
  },
};
