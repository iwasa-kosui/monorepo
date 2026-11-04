import { createD1ActorResolverByUserId } from '../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1ArticleResolver } from '../adaptor/d1/article/articleResolver.ts';
import { createD1ArticleWithBodyCreatedStore } from '../adaptor/d1/article/articleWithBodyCreatedStore.ts';
import { createD1ArticleWithDependentsDeletedStore } from '../adaptor/d1/article/articleWithDependentsDeletedStore.ts';
import { createD1DraftArticleWithDependentsDeletedStore } from '../adaptor/d1/article/draftArticleWithDependentsDeletedStore.ts';
import { createD1ArticleBodyResolver } from '../adaptor/d1/articleBody/articleBodyResolver.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1DigestCreatedStore } from '../adaptor/d1/digest/digestCreatedStore.ts';
import { createD1DigestExpiredStore } from '../adaptor/d1/digest/digestExpiredStore.ts';
import { createD1DigestHeadersResolverByDigestDateBefore } from '../adaptor/d1/digest/digestHeadersResolverByDigestDateBefore.ts';
import { createD1DigestHeadersResolverByUserIdAndDigestDate } from '../adaptor/d1/digest/digestHeadersResolverByUserIdAndDigestDate.ts';
import { createD1DigestItemUrlsResolverByUserId } from '../adaptor/d1/digest/digestItemUrlsResolverByUserId.ts';
import { createD1DigestPushSentStore } from '../adaptor/d1/digest/digestPushSentStore.ts';
import { createD1LatestDigestHeaderResolverByUserId } from '../adaptor/d1/digest/latestDigestHeaderResolverByUserId.ts';
import { createD1DigestRequestUsageRecorder } from '../adaptor/d1/digestRequest/digestRequestUsageRecorder.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../adaptor/d1/digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1DigestTopicCreatedStore } from '../adaptor/d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../adaptor/d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../adaptor/d1/digestTopic/digestTopicsResolverByUserId.ts';
import { createD1HatenaTrendsResolverByFetchedSince } from '../adaptor/d1/feedEntry/hatenaTrendsResolverByFetchedSince.ts';
import { createD1RadarFeedEntriesResolverByFetchedSince } from '../adaptor/d1/feedEntry/radarFeedEntriesResolverByFetchedSince.ts';
import { createD1TimelineLinkTrendsResolverByUserId } from '../adaptor/d1/linkPreview/timelineLinkTrendsResolverByUserId.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1InterestVectorsResolverByUserId } from '../adaptor/d1/recommendation/interestVectorsResolverByUserId.ts';
import { createD1RecommendableArticlesResolverByFetchedSince } from '../adaptor/d1/recommendation/recommendableArticlesResolverByFetchedSince.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createSafeFetcher } from '../adaptor/http/safeFetch.ts';
import { createCloudflareWebPushSender } from '../adaptor/webPush/cloudflareWebPushSender.ts';
import { createWorkersAiEmbedder } from '../adaptor/workersAi/workersAiEmbedder.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import { createWorkersAiTextGenerator } from '../adaptor/workersAi/workersAiTextGenerator.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Username } from '../domain/user/username.ts';
import { CreateArticleWithBodyUseCase } from '../useCase/createArticleWithBody.ts';
import { CreateDailyDigestUseCase } from '../useCase/createDailyDigest.ts';
import { EnsureDefaultDigestTopicsUseCase } from '../useCase/ensureDefaultDigestTopics.ts';
import { ExpireDigestsUseCase } from '../useCase/expireDigests.ts';
import { RequestDigestUseCase } from '../useCase/requestDigest.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const DAILY_DIGEST_USERNAME = 'kosui';

export const createDigestUseCases = (env: IoriWorkerEnv) => {
  const db = createD1Db(env.DB);
  const now = Instant.now;
  const workersAi = env.AI as unknown as WorkersAiRunner | undefined;
  const digestHeadersResolverByUserIdAndDigestDate = createD1DigestHeadersResolverByUserIdAndDigestDate(db);
  const digestTopicsResolverByUserId = createD1DigestTopicsResolverByUserId(db);
  const articleResolver = createD1ArticleResolver(db);
  const articleBodyResolver = createD1ArticleBodyResolver(db);
  const createDailyDigest = CreateDailyDigestUseCase.create({
    digestSubscriptionResolverByUserId: createD1DigestSubscriptionResolverByUserId(db),
    digestHeadersResolverByUserIdAndDigestDate,
    latestDigestHeaderResolverByUserId: createD1LatestDigestHeaderResolverByUserId(db),
    digestItemUrlsResolverByUserId: createD1DigestItemUrlsResolverByUserId(db),
    ensureDefaultDigestTopicsUseCase: EnsureDefaultDigestTopicsUseCase.create({
      digestTopicsResolverByUserId,
      digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
      digestTopicEmbeddedStore: createD1DigestTopicEmbeddedStore(db),
      textEmbedder: workersAi === undefined ? undefined : createWorkersAiEmbedder(workersAi),
      now,
    }),
    articleResolver,
    articleBodyResolver,
    articleWithDependentsDeletedStore: createD1ArticleWithDependentsDeletedStore(db),
    draftArticleWithDependentsDeletedStore: createD1DraftArticleWithDependentsDeletedStore(db),
    radarFeedEntriesResolverByFetchedSince: createD1RadarFeedEntriesResolverByFetchedSince(db),
    hatenaTrendsResolverByFetchedSince: createD1HatenaTrendsResolverByFetchedSince(db),
    timelineLinkTrendsResolverByUserId: createD1TimelineLinkTrendsResolverByUserId(db),
    interestVectorsResolverByUserId: createD1InterestVectorsResolverByUserId(db),
    recommendableArticlesResolverByFetchedSince: createD1RecommendableArticlesResolverByFetchedSince(db),
    safeFetcher: createSafeFetcher(),
    textGenerator: workersAi === undefined ? undefined : createWorkersAiTextGenerator(workersAi),
    createArticleWithBodyUseCase: CreateArticleWithBodyUseCase.create({
      actorResolverByUserId: createD1ActorResolverByUserId(db),
      articleWithBodyCreatedStore: createD1ArticleWithBodyCreatedStore(db),
    }),
    digestCreatedStore: createD1DigestCreatedStore(db),
    digestPushSentStore: createD1DigestPushSentStore(db),
    pushSubscriptionsResolverByUserId: createD1PushSubscriptionsResolverByUserId(db),
    webPushSender: createCloudflareWebPushSender({
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    }),
    now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  return {
    userResolverByUsername: createD1UserResolverByUsername(db),
    createDailyDigest,
    requestDigest: RequestDigestUseCase.create({
      digestHeadersResolverByUserIdAndDigestDate,
      articleResolver,
      articleBodyResolver,
      digestRequestUsageRecorder: createD1DigestRequestUsageRecorder(db),
      createDailyDigestUseCase: createDailyDigest,
      now,
    }),
    expireDigests: ExpireDigestsUseCase.create({
      digestHeadersResolverByDigestDateBefore: createD1DigestHeadersResolverByDigestDateBefore(db),
      digestExpiredStore: createD1DigestExpiredStore(db),
      now,
    }),
  } as const;
};

export const createDailyDigestTask: ScheduledTask = {
  name: 'createDailyDigest',
  run: async ({ env }) => {
    const useCases = createDigestUseCases(env);
    const user = await useCases.userResolverByUsername.resolve(Username.parseOrThrow(DAILY_DIGEST_USERNAME));
    if (user.val === undefined) {
      console.warn('iori digest: the digest user was not found.', { username: DAILY_DIGEST_USERNAME });
      return;
    }
    const result = await useCases.createDailyDigest.run({ userId: user.val.id, trigger: 'scheduled' });
    if (!result.ok) throw new Error(result.err.message);
    console.info('iori digest created.', result.val);
  },
};

export const expireDigestsTask: ScheduledTask = {
  name: 'expireDigests',
  run: async ({ env }) => {
    const result = await createDigestUseCases(env).expireDigests.run();
    console.info('iori digests expired.', result.val);
  },
};
