import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyLikeSavedStore,
  type BlueskyLikeTargetNotFound,
  type BlueskyLikeTargetResolver,
  deriveBlueskyLikeRkey,
} from '../domain/blueskyTimeline/blueskyLike.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }>;

type Ok = Readonly<{ liked: true }>;

type Err = BlueskyClientError | BlueskyLikeTargetNotFound;

export type LikeBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'createLike'>;
  targetResolver: BlueskyLikeTargetResolver;
  savedStore: BlueskyLikeSavedStore;
  now: () => Instant;
}>;

const create = ({ client, targetResolver, savedStore, now }: Deps): LikeBlueskyPostUseCase => {
  const run = async ({ feedItemId }: Input): RA<Ok, Err> => {
    const target = Result.unsafeUnwrap(await targetResolver.resolve(feedItemId));
    if (target === undefined) return RA.err({ type: 'BlueskyLikeTargetNotFound' });
    if (target.likeUri !== null) return RA.ok({ liked: true });
    const created = await client.createLike(
      { uri: target.uri, cid: target.cid },
      await deriveBlueskyLikeRkey(target.uri),
    );
    if (!created.ok) return RA.err(created.err);
    Result.unsafeUnwrap(
      await savedStore.save({ subjectUri: target.uri, likeUri: created.val.uri, createdAt: now() }),
    );
    return RA.ok({ liked: true });
  };

  return { run };
};

export const LikeBlueskyPostUseCase = {
  create,
} as const;
