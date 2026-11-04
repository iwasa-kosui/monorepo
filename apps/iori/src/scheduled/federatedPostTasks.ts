import { createD1Db } from '../adaptor/d1/client.ts';
import { createD1PrunableRemotePostIdsResolverByReceivedBefore } from '../adaptor/d1/post/prunableRemotePostIdsResolverByReceivedBefore.ts';
import { createD1RemotePostsPrunedStore } from '../adaptor/d1/post/remotePostsPrunedStore.ts';
import { Instant } from '../domain/instant/instant.ts';
import { PruneFederatedPostsUseCase } from '../useCase/pruneFederatedPosts.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import type { ScheduledTask } from './scheduledTasks.ts';

export const PRUNE_FEDERATED_POSTS_ENABLED_VALUE = 'enabled';

const createPruneFederatedPostsUseCase = (env: IoriWorkerEnv): PruneFederatedPostsUseCase => {
  const db = createD1Db(env.DB);
  return PruneFederatedPostsUseCase.create({
    prunableRemotePostIdsResolverByReceivedBefore: createD1PrunableRemotePostIdsResolverByReceivedBefore(db),
    remotePostsPrunedStore: createD1RemotePostsPrunedStore(db),
    now: Instant.now,
  });
};

export const createPruneFederatedPostsTask = (
  createUseCase: (env: IoriWorkerEnv) => PruneFederatedPostsUseCase,
): ScheduledTask => ({
  name: 'pruneFederatedPosts',
  run: async ({ env }) => {
    if (env.IORI_PRUNE_FEDERATED_POSTS !== PRUNE_FEDERATED_POSTS_ENABLED_VALUE) {
      console.info('iori federated posts pruning is disabled.');
      return;
    }
    const result = await createUseCase(env).run();
    console.info('iori federated posts pruned.', result.val);
  },
});

export const pruneFederatedPostsTask = createPruneFederatedPostsTask(createPruneFederatedPostsUseCase);
