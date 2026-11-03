import { createD1ActorResolverByUserId } from '../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1InterestSourceContentChangedStore } from '../adaptor/d1/interestSource/interestSourceContentChangedStore.ts';
import { createD1InterestSourceCreatedStore } from '../adaptor/d1/interestSource/interestSourceCreatedStore.ts';
import { createD1InterestSourceDeletedStore } from '../adaptor/d1/interestSource/interestSourceDeletedStore.ts';
import { createD1InterestSourceEmbeddedStore } from '../adaptor/d1/interestSource/interestSourceEmbeddedStore.ts';
import { createD1InterestSourcesResolverByUserIdAndKindIncludingDeleted } from '../adaptor/d1/interestSource/interestSourcesResolverByUserIdAndKindIncludingDeleted.ts';
import { createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding } from '../adaptor/d1/interestSource/interestSourcesResolverByUserIdAndKindsPendingEmbedding.ts';
import { createD1LikedPostContentsResolverByLikeIds } from '../adaptor/d1/interestSource/likedPostContentsResolverByLikeIds.ts';
import { createD1OwnLikeContentsResolverByActorId } from '../adaptor/d1/interestSource/ownLikeContentsResolverByActorId.ts';
import { createD1OwnPostContentsResolverByActorId } from '../adaptor/d1/interestSource/ownPostContentsResolverByActorId.ts';
import { createD1PostContentsResolverByPostIds } from '../adaptor/d1/interestSource/postContentsResolverByPostIds.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { createSafeFetcher } from '../adaptor/http/safeFetch.ts';
import { createWorkersAiEmbedder } from '../adaptor/workersAi/workersAiEmbedder.ts';
import type { WorkersAiRunner } from '../adaptor/workersAi/workersAiRunner.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Username } from '../domain/user/username.ts';
import { EmbedOwnInterestSourcesUseCase } from '../useCase/embedOwnInterestSources.ts';
import { SyncKosuiInterestSourcesUseCase } from '../useCase/syncKosuiInterestSources.ts';
import { SyncOwnInterestSourcesUseCase } from '../useCase/syncOwnInterestSources.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { DAILY_DIGEST_USERNAME } from './digestTasks.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const createInterestUseCases = (env: IoriWorkerEnv) => {
  const db = createD1Db(env.DB);
  const now = Instant.now;
  const workersAi = env.AI as unknown as WorkersAiRunner | undefined;
  const textEmbedder = workersAi === undefined ? undefined : createWorkersAiEmbedder(workersAi);
  const interestSourceCreatedStore = createD1InterestSourceCreatedStore(db);
  const interestSourceContentChangedStore = createD1InterestSourceContentChangedStore(db);
  const interestSourceDeletedStore = createD1InterestSourceDeletedStore(db);
  const interestSourceEmbeddedStore = createD1InterestSourceEmbeddedStore(db);
  const interestSourcesResolverByUserIdAndKindIncludingDeleted =
    createD1InterestSourcesResolverByUserIdAndKindIncludingDeleted(db);
  const interestSourcesResolverByUserIdAndKindsPendingEmbedding =
    createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding(db);
  return {
    userResolverByUsername: createD1UserResolverByUsername(db),
    syncKosuiInterestSources: SyncKosuiInterestSourcesUseCase.create({
      interestSourcesResolverByUserIdAndKindIncludingDeleted,
      interestSourcesResolverByUserIdAndKindsPendingEmbedding,
      interestSourceCreatedStore,
      interestSourceContentChangedStore,
      interestSourceDeletedStore,
      interestSourceEmbeddedStore,
      safeFetcher: createSafeFetcher(),
      textEmbedder,
      now,
    }),
    syncOwnInterestSources: SyncOwnInterestSourcesUseCase.create({
      actorResolverByUserId: createD1ActorResolverByUserId(db),
      ownPostContentsResolverByActorId: createD1OwnPostContentsResolverByActorId(db),
      ownLikeContentsResolverByActorId: createD1OwnLikeContentsResolverByActorId(db),
      interestSourcesResolverByUserIdAndKindIncludingDeleted,
      interestSourceCreatedStore,
      interestSourceContentChangedStore,
      interestSourceDeletedStore,
      now,
    }),
    embedOwnInterestSources: EmbedOwnInterestSourcesUseCase.create({
      interestSourcesResolverByUserIdAndKindsPendingEmbedding,
      postContentsResolverByPostIds: createD1PostContentsResolverByPostIds(db),
      likedPostContentsResolverByLikeIds: createD1LikedPostContentsResolverByLikeIds(db),
      interestSourceEmbeddedStore,
      textEmbedder,
      now,
    }),
  } as const;
};

export const syncKosuiInterestSourcesTask: ScheduledTask = {
  name: 'syncKosuiInterestSources',
  run: async ({ env }) => {
    const useCases = createInterestUseCases(env);
    const user = await useCases.userResolverByUsername.resolve(Username.parseOrThrow(DAILY_DIGEST_USERNAME));
    if (user.val === undefined) {
      console.warn('iori interest sources: the user was not found.', { username: DAILY_DIGEST_USERNAME });
      return;
    }
    const result = await useCases.syncKosuiInterestSources.run({ userId: user.val.id });
    if (!result.ok) throw new Error(result.err.message);
    console.info('iori interest sources synced.', { source: 'kosui.me', ...result.val });
  },
};

export const syncOwnInterestSourcesTask: ScheduledTask = {
  name: 'syncOwnInterestSources',
  run: async ({ env }) => {
    const useCases = createInterestUseCases(env);
    const user = await useCases.userResolverByUsername.resolve(Username.parseOrThrow(DAILY_DIGEST_USERNAME));
    if (user.val === undefined) {
      console.warn('iori interest sources: the user was not found.', { username: DAILY_DIGEST_USERNAME });
      return;
    }
    const result = await useCases.syncOwnInterestSources.run({ userId: user.val.id });
    if (!result.ok) throw new Error(result.err.message);
    console.info('iori interest sources synced.', { source: 'iori', ...result.val });
  },
};

export const embedOwnInterestSourcesTask: ScheduledTask = {
  name: 'embedOwnInterestSources',
  run: async ({ env }) => {
    const useCases = createInterestUseCases(env);
    const user = await useCases.userResolverByUsername.resolve(Username.parseOrThrow(DAILY_DIGEST_USERNAME));
    if (user.val === undefined) {
      console.warn('iori interest sources: the user was not found.', { username: DAILY_DIGEST_USERNAME });
      return;
    }
    const result = await useCases.embedOwnInterestSources.run({ userId: user.val.id });
    if (!result.ok) throw new Error(result.err.message);
    console.info('iori interest sources embedded.', { source: 'iori', ...result.val });
  },
};
