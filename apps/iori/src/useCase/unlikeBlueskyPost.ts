import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyLikeDeletedStore,
  blueskyLikeRkey,
  type BlueskyLikeTargetNotFound,
  type BlueskyLikeTargetResolver,
  type BlueskyLikeUriResolver,
} from '../domain/blueskyTimeline/blueskyLike.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../ports/blueskyPostCidResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

type Ok = Readonly<{ liked: false }>;

type Err = BlueskyClientError | BlueskyLikeTargetNotFound;

export type UnlikeBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'deleteLike'>;
  targetResolver: BlueskyLikeTargetResolver;
  likeUriResolver: BlueskyLikeUriResolver;
  cidResolver: BlueskyPostCidResolver;
  deletedStore: BlueskyLikeDeletedStore;
}>;

const create = (
  { client, targetResolver, likeUriResolver, cidResolver, deletedStore }: Deps,
): UnlikeBlueskyPostUseCase => {
  const resolveByUri = async (uri: string): RA<{ uri: string; likeUri: string | null }, BlueskyClientError> => {
    const stored = Result.unsafeUnwrap(await likeUriResolver.resolve(uri));
    if (stored !== null) return RA.ok({ uri, likeUri: stored });
    const subject = await cidResolver.resolve(uri);
    if (!subject.ok) return RA.err(subject.err);
    return RA.ok({ uri, likeUri: subject.val?.likeUri ?? null });
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const resolved = 'feedItemId' in input
      ? Result.ok(Result.unsafeUnwrap(await targetResolver.resolve(input.feedItemId)))
      : await resolveByUri(input.uri);
    if (!resolved.ok) return RA.err(resolved.err);
    const target = resolved.val;
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
