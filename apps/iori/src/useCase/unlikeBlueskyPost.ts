import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyLikeDeletedStore,
  blueskyLikeRkey,
  type BlueskyLikeTargetNotFound,
  type BlueskyLikeTargetResolver,
} from '../domain/blueskyTimeline/blueskyLike.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }>;

type Ok = Readonly<{ liked: false }>;

type Err = BlueskyClientError | BlueskyLikeTargetNotFound;

export type UnlikeBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'deleteLike'>;
  targetResolver: BlueskyLikeTargetResolver;
  deletedStore: BlueskyLikeDeletedStore;
}>;

const create = ({ client, targetResolver, deletedStore }: Deps): UnlikeBlueskyPostUseCase => {
  const run = async ({ feedItemId }: Input): RA<Ok, Err> => {
    const target = Result.unsafeUnwrap(await targetResolver.resolve(feedItemId));
    if (target === undefined) return RA.err({ type: 'BlueskyLikeTargetNotFound' });
    if (target.likeUri === null) return RA.ok({ liked: false });
    const rkey = blueskyLikeRkey(target.likeUri);
    if (rkey === undefined) {
      return RA.err({ type: 'BlueskyClientError', kind: 'invalid_response', message: 'stored like uri is invalid' });
    }
    const deleted = await client.deleteLike(rkey);
    if (!deleted.ok) return RA.err(deleted.err);
    Result.unsafeUnwrap(await deletedStore.deleteBySubjectUri(target.uri));
    return RA.ok({ liked: false });
  };

  return { run };
};

export const UnlikeBlueskyPostUseCase = {
  create,
} as const;
