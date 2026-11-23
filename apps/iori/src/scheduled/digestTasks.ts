import { Result } from '@iwasa-kosui/result';

import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1DigestCreatedStore } from '../adaptor/d1/digest/digestCreatedStore.ts';
import { createD1DigestExpiredStore } from '../adaptor/d1/digest/digestExpiredStore.ts';
import { createD1DigestHeadersResolverByDigestDateBefore } from '../adaptor/d1/digest/digestHeadersResolverByDigestDateBefore.ts';
import { createD1DigestHeadersResolverByUserIdAndDigestDate } from '../adaptor/d1/digest/digestHeadersResolverByUserIdAndDigestDate.ts';
import { createD1DigestItemUrlsResolverByUserId } from '../adaptor/d1/digest/digestItemUrlsResolverByUserId.ts';
import { createD1DigestsResolverByXPostsCreatedBefore } from '../adaptor/d1/digest/digestsResolverByXPostsCreatedBefore.ts';
import { createD1DigestXPostsRemovedStore } from '../adaptor/d1/digest/digestXPostsRemovedStore.ts';
import { createD1LatestDigestHeaderResolverByUserId } from '../adaptor/d1/digest/latestDigestHeaderResolverByUserId.ts';
import { createD1DigestRequestUsageRecorder } from '../adaptor/d1/digestRequest/digestRequestUsageRecorder.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../adaptor/d1/digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1DigestTopicCreatedStore } from '../adaptor/d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../adaptor/d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../adaptor/d1/digestTopic/digestTopicsResolverByUserId.ts';
import { createD1HatenaTrendsResolverByFetchedSince } from '../adaptor/d1/feedEntry/hatenaTrendsResolverByFetchedSince.ts';
import { createD1RadarFeedEntriesResolverByFetchedSince } from '../adaptor/d1/feedEntry/radarFeedEntriesResolverByFetchedSince.ts';
import { createD1XPostsResolverByFetchedSince } from '../adaptor/d1/feedEntry/xPostsResolverByFetchedSince.ts';
import { createD1TimelineLinkTrendsResolverByUserId } from '../adaptor/d1/linkPreview/timelineLinkTrendsResolverByUserId.ts';
import { createD1InterestVectorsResolverByUserId } from '../adaptor/d1/recommendation/interestVectorsResolverByUserId.ts';
import { createD1RecommendableArticlesResolverByFetchedSince } from '../adaptor/d1/recommendation/recommendableArticlesResolverByFetchedSince.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createSafeFetcher } from '../adaptor/http/safeFetch.ts';
import { createWorkersAiEmbedder } from '../adaptor/workersAi/workersAiEmbedder.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import { createWorkersAiTextGenerator } from '../adaptor/workersAi/workersAiTextGenerator.ts';
import { AI_AGENT_BOT_USERNAME } from '../domain/aiAgentBot/aiAgentBot.ts';
import type { DigestDmSender } from '../domain/digest/digest.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import { Username } from '../domain/user/username.ts';
import { AI_AGENT_BOT_ENABLED_VALUE } from '../runtime/aiAgentBot.ts';
import { createDigestDmSender, createDigestPostDeleter } from '../runtime/digestDm.ts';
import { createWorkerRuntimePorts } from '../runtime/workerRuntime.ts';
import { CreateDailyDigestUseCase } from '../useCase/createDailyDigest.ts';
import { EnsureDefaultDigestTopicsUseCase } from '../useCase/ensureDefaultDigestTopics.ts';
import { ExpireDigestsUseCase } from '../useCase/expireDigests.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { RemoveExpiredDigestXPostsUseCase } from '../useCase/removeExpiredDigestXPosts.ts';
import { RequestDigestUseCase } from '../useCase/requestDigest.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask, ScheduledTaskContext } from './scheduledTasks.ts';

export const DAILY_DIGEST_USERNAME = 'kosui';

export const createDigestUseCases = (env: IoriWorkerEnv) => {
  const db = createD1Db(env.DB);
  return {
    userResolverByUsername: createD1UserResolverByUsername(db),
    expireDigests: ExpireDigestsUseCase.create({
      digestHeadersResolverByDigestDateBefore: createD1DigestHeadersResolverByDigestDateBefore(db),
      digestExpiredStore: createD1DigestExpiredStore(db),
      now: Instant.now,
    }),
  } as const;
};

export type DigestSendingDeps = Readonly<{
  dmSender: DigestDmSender;
  deletePost: (postId: PostId) => Promise<Result<void, string>>;
}>;

export const createDigestSendingUseCases = (env: IoriWorkerEnv, deps: DigestSendingDeps) => {
  const db = createD1Db(env.DB);
  const now = Instant.now;
  const workersAi = env.AI as unknown as WorkersAiRunner | undefined;
  const createDailyDigest = CreateDailyDigestUseCase.create({
    digestSubscriptionResolverByUserId: createD1DigestSubscriptionResolverByUserId(db),
    digestHeadersResolverByUserIdAndDigestDate: createD1DigestHeadersResolverByUserIdAndDigestDate(db),
    latestDigestHeaderResolverByUserId: createD1LatestDigestHeaderResolverByUserId(db),
    digestItemUrlsResolverByUserId: createD1DigestItemUrlsResolverByUserId(db),
    ensureDefaultDigestTopicsUseCase: EnsureDefaultDigestTopicsUseCase.create({
      digestTopicsResolverByUserId: createD1DigestTopicsResolverByUserId(db),
      digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
      digestTopicEmbeddedStore: createD1DigestTopicEmbeddedStore(db),
      textEmbedder: workersAi === undefined ? undefined : createWorkersAiEmbedder(workersAi),
      now,
    }),
    radarFeedEntriesResolverByFetchedSince: createD1RadarFeedEntriesResolverByFetchedSince(db),
    hatenaTrendsResolverByFetchedSince: createD1HatenaTrendsResolverByFetchedSince(db),
    timelineLinkTrendsResolverByUserId: createD1TimelineLinkTrendsResolverByUserId(db),
    xPostsResolverByFetchedSince: createD1XPostsResolverByFetchedSince(db),
    isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
    interestVectorsResolverByUserId: createD1InterestVectorsResolverByUserId(db),
    recommendableArticlesResolverByFetchedSince: createD1RecommendableArticlesResolverByFetchedSince(db),
    safeFetcher: createSafeFetcher(),
    textGenerator: workersAi === undefined ? undefined : createWorkersAiTextGenerator(workersAi),
    digestDmSender: deps.dmSender,
    digestCreatedStore: createD1DigestCreatedStore(db),
    now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  return {
    createDailyDigest,
    requestDigest: RequestDigestUseCase.create({
      digestRequestUsageRecorder: createD1DigestRequestUsageRecorder(db),
      createDailyDigestUseCase: createDailyDigest,
      now,
    }),
    removeExpiredDigestXPosts: RemoveExpiredDigestXPostsUseCase.create({
      digestsResolverByXPostsCreatedBefore: createD1DigestsResolverByXPostsCreatedBefore(db),
      digestXPostsRemovedStore: createD1DigestXPostsRemovedStore(db),
      deletePost: deps.deletePost,
      now,
    }),
  } as const;
};

type ResolveDigestSending = (
  env: IoriWorkerEnv,
  waitUntil: ScheduledTaskContext['waitUntil'],
) => Promise<DigestSendingDeps | undefined>;

const resolveBotDigestSending: ResolveDigestSending = async (env, waitUntil) => {
  if (env.IORI_AI_AGENT_BOT !== AI_AGENT_BOT_ENABLED_VALUE) {
    console.warn('iori digest: the ai agent bot is disabled, so the digest DM task did nothing.');
    return undefined;
  }
  const runtime = await createWorkerRuntimePorts(env, waitUntil);
  const botUser = await runtime.mastodon.userResolverByUsername.resolve(Username.parseOrThrow(AI_AGENT_BOT_USERNAME));
  const botActor = botUser.val === undefined
    ? undefined
    : (await runtime.mastodon.actorResolverByUserId.resolve(botUser.val.id)).val;
  if (botUser.val === undefined || botActor === undefined) {
    console.warn('iori digest: the ai agent bot user was not found, so the digest DM task did nothing.', {
      username: AI_AGENT_BOT_USERNAME,
    });
    return undefined;
  }
  const bot = { user: botUser.val, actor: botActor };
  const request = new Request(new URL('/', env.ORIGIN));
  const ctx = runtime.federation.createContext(request, undefined);
  return {
    dmSender: createDigestDmSender(runtime, bot, { request, ctx }),
    deletePost: createDigestPostDeleter(runtime, bot, { ctx }),
  };
};

export const createDailyDigestTaskFrom = (resolveSending: ResolveDigestSending): ScheduledTask => ({
  name: 'createDailyDigest',
  run: async ({ env, waitUntil }) => {
    const user = await createDigestUseCases(env).userResolverByUsername.resolve(
      Username.parseOrThrow(DAILY_DIGEST_USERNAME),
    );
    if (user.val === undefined) {
      console.warn('iori digest: the digest user was not found.', { username: DAILY_DIGEST_USERNAME });
      return;
    }
    const sending = await resolveSending(env, waitUntil);
    if (sending === undefined) return;
    const result = await createDigestSendingUseCases(env, sending).createDailyDigest.run({
      userId: user.val.id,
      trigger: 'scheduled',
    });
    if (!result.ok) throw new Error(result.err.message);
    console.info('iori digest created.', result.val);
  },
});

export const removeExpiredDigestXPostsTaskFrom = (resolveSending: ResolveDigestSending): ScheduledTask => ({
  name: 'removeExpiredDigestXPosts',
  run: async ({ env, waitUntil }) => {
    const sending = await resolveSending(env, waitUntil);
    if (sending === undefined) return;
    const result = await createDigestSendingUseCases(env, sending).removeExpiredDigestXPosts.run();
    console.info('iori digest X posts removed.', result.val);
  },
});

export const createDailyDigestTask = createDailyDigestTaskFrom(resolveBotDigestSending);

export const removeExpiredDigestXPostsTask = removeExpiredDigestXPostsTaskFrom(resolveBotDigestSending);

export const expireDigestsTask: ScheduledTask = {
  name: 'expireDigests',
  run: async ({ env }) => {
    const result = await createDigestUseCases(env).expireDigests.run();
    console.info('iori digests expired.', result.val);
  },
};
