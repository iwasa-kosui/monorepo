import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type {
  PrunableRemotePostIdsResolverByReceivedBefore,
  RemotePostsPrunedStore,
} from '../domain/post/remotePostPruning.ts';
import type { UseCase } from './useCase.ts';

export const FEDERATED_POST_RETENTION_DAYS = 7;
const PRUNE_BATCH_SIZE = 50;
const PRUNE_MAX_BATCHES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

type Input = void;

type Ok = Readonly<{ pruned: number }>;

type Err = never;

export type PruneFederatedPostsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  prunableRemotePostIdsResolverByReceivedBefore: PrunableRemotePostIdsResolverByReceivedBefore;
  remotePostsPrunedStore: RemotePostsPrunedStore;
  now: () => Instant;
}>;

const create = ({
  prunableRemotePostIdsResolverByReceivedBefore,
  remotePostsPrunedStore,
  now,
}: Deps): PruneFederatedPostsUseCase => {
  const run = async () => {
    const receivedBefore = Instant.addDuration(now(), -FEDERATED_POST_RETENTION_DAYS * DAY_MS);
    let pruned = 0;
    for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch += 1) {
      const postIds = await prunableRemotePostIdsResolverByReceivedBefore.resolve({
        receivedBefore,
        limit: PRUNE_BATCH_SIZE,
      });
      if (postIds.val.length === 0) break;
      await remotePostsPrunedStore.store(postIds.val);
      pruned += postIds.val.length;
      if (postIds.val.length < PRUNE_BATCH_SIZE) break;
    }
    return RA.ok({ pruned });
  };

  return { run };
};

export const PruneFederatedPostsUseCase = {
  create,
} as const;
