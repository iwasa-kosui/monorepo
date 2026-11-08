import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1FeedEntriesResolverByFeedSourceIdAndGuids } from '../adaptor/d1/feedEntry/feedEntriesResolverByFeedSourceIdAndGuids.ts';
import { createD1FeedEntriesResolverByFetchedBefore } from '../adaptor/d1/feedEntry/feedEntriesResolverByFetchedBefore.ts';
import { createD1FeedEntriesResolverByFetchedSinceExcludingKinds } from '../adaptor/d1/feedEntry/feedEntriesResolverByFetchedSinceExcludingKinds.ts';
import { createD1FeedEntriesResolverByFetchedSincePendingEmbedding } from '../adaptor/d1/feedEntry/feedEntriesResolverByFetchedSincePendingEmbedding.ts';
import { createD1FeedEntryBookmarkCountUpdatedStore } from '../adaptor/d1/feedEntry/feedEntryBookmarkCountUpdatedStore.ts';
import { createD1FeedEntryCollectedStore } from '../adaptor/d1/feedEntry/feedEntryCollectedStore.ts';
import { createD1FeedEntryEmbeddedStore } from '../adaptor/d1/feedEntry/feedEntryEmbeddedStore.ts';
import { createD1FeedEntryExpiredStore } from '../adaptor/d1/feedEntry/feedEntryExpiredStore.ts';
import { createD1FeedEntryMaxGuidResolverByFeedSourceId } from '../adaptor/d1/feedEntry/feedEntryMaxGuidResolverByFeedSourceId.ts';
import { createD1AllFeedSourcesResolver } from '../adaptor/d1/feedSource/allFeedSourcesResolver.ts';
import { createD1FeedSourceCreatedStore } from '../adaptor/d1/feedSource/feedSourceCreatedStore.ts';
import { createD1FeedSourceFetchedStore } from '../adaptor/d1/feedSource/feedSourceFetchedStore.ts';
import { createD1FeedSourceFetchFailedStore } from '../adaptor/d1/feedSource/feedSourceFetchFailedStore.ts';
import { createD1FeedSourceFetchReserver } from '../adaptor/d1/feedSource/feedSourceFetchReserver.ts';
import { createD1FeedSourcesResolverByEnabled } from '../adaptor/d1/feedSource/feedSourcesResolverByEnabled.ts';
import { createSafeFetcher } from '../adaptor/http/safeFetch.ts';
import { createTwitterApiIoClient, type TwitterApiIoClient } from '../adaptor/twitterApiIo/twitterApiIoClient.ts';
import { createWorkersAiEmbedder } from '../adaptor/workersAi/workersAiEmbedder.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import { Instant } from '../domain/instant/instant.ts';
import { CollectFeedEntriesUseCase } from '../useCase/collectFeedEntries.ts';
import { DetectRadarVolumeUseCase } from '../useCase/detectRadarVolume.ts';
import { EmbedFeedEntriesUseCase } from '../useCase/embedFeedEntries.ts';
import { EnsureDefaultFeedSourcesUseCase } from '../useCase/ensureDefaultFeedSources.ts';
import { RefreshHatenaBookmarkCountsUseCase } from '../useCase/refreshHatenaBookmarkCounts.ts';
import { RefreshXPostsUseCase } from '../useCase/refreshXPosts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

const createTwitterApiIoClientOf = (env: IoriWorkerEnv): TwitterApiIoClient | undefined => {
  const apiKey = env.TWITTERAPI_IO_API_KEY;
  return apiKey === undefined || apiKey === ''
    ? undefined
    : createTwitterApiIoClient({
      safeFetcher: createSafeFetcher(),
      apiKey,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: Instant.now,
    });
};

export const createRefreshXPostsUseCase = (env: IoriWorkerEnv): RefreshXPostsUseCase | undefined => {
  const twitterApiIoClient = createTwitterApiIoClientOf(env);
  if (twitterApiIoClient === undefined) return undefined;
  const db = createD1Db(env.DB);
  return RefreshXPostsUseCase.create({
    feedSourcesResolverByEnabled: createD1FeedSourcesResolverByEnabled(db),
    feedSourceFetchReserver: createD1FeedSourceFetchReserver(db),
    feedEntriesResolverByFeedSourceIdAndGuids: createD1FeedEntriesResolverByFeedSourceIdAndGuids(db),
    feedSourceFetchedStore: createD1FeedSourceFetchedStore(db),
    feedSourceFetchFailedStore: createD1FeedSourceFetchFailedStore(db),
    feedEntryCollectedStore: createD1FeedEntryCollectedStore(db),
    feedEntryBookmarkCountUpdatedStore: createD1FeedEntryBookmarkCountUpdatedStore(db),
    feedEntryMaxGuidResolverByFeedSourceId: createD1FeedEntryMaxGuidResolverByFeedSourceId(db),
    twitterApiIoClient,
    now: Instant.now,
  });
};

export const createFeedUseCases = (env: IoriWorkerEnv) => {
  const db = createD1Db(env.DB);
  const now = Instant.now;
  const workersAi = env.AI as unknown as WorkersAiRunner | undefined;
  const textEmbedder = workersAi === undefined ? undefined : createWorkersAiEmbedder(workersAi);
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
      feedEntryMaxGuidResolverByFeedSourceId: createD1FeedEntryMaxGuidResolverByFeedSourceId(db),
      safeFetcher: createSafeFetcher(),
      twitterApiIoClient: createTwitterApiIoClientOf(env),
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
    embedFeedEntries: EmbedFeedEntriesUseCase.create({
      feedEntriesResolverByFetchedSincePendingEmbedding: createD1FeedEntriesResolverByFetchedSincePendingEmbedding(db),
      feedEntryEmbeddedStore: createD1FeedEntryEmbeddedStore(db),
      textEmbedder,
      now,
    }),
  } as const;
};

const embedPendingFeedEntries = async (embedFeedEntries: EmbedFeedEntriesUseCase): Promise<void> => {
  try {
    const result = await embedFeedEntries.run();
    if (!result.ok) {
      console.error('iori feed entries: embedding failed.', { errorMessage: result.err.message });
      return;
    }
    console.info('iori feed entries embedded.', result.val);
  } catch (error) {
    console.error('iori feed entries: embedding failed.', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

export const collectFeedsTask: ScheduledTask = {
  name: 'collectFeeds',
  run: async ({ env }) => {
    const useCases = createFeedUseCases(env);
    try {
      await useCases.ensureDefaultFeedSources.run();
      const summary = await useCases.collectFeedEntries.run();
      console.info('iori feeds collected.', summary.val);
    } finally {
      await embedPendingFeedEntries(useCases.embedFeedEntries);
      const refreshed = await useCases.refreshHatenaBookmarkCounts.run();
      console.info('iori hatena bookmark counts refreshed.', refreshed.val);
    }
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
