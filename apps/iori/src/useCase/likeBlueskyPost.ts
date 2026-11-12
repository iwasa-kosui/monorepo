import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyLikeSavedStore,
  type BlueskyLikeTarget,
  type BlueskyLikeTargetNotFound,
  type BlueskyLikeTargetResolver,
  type BlueskyLikeUriResolver,
  deriveBlueskyLikeRkey,
} from '../domain/blueskyTimeline/blueskyLike.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../ports/blueskyPostCidResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

type Ok = Readonly<{ liked: true }>;

type Err = BlueskyClientError | BlueskyLikeTargetNotFound;

export type LikeBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'createLike'>;
  targetResolver: BlueskyLikeTargetResolver;
  likeUriResolver: BlueskyLikeUriResolver;
  cidResolver: BlueskyPostCidResolver;
  savedStore: BlueskyLikeSavedStore;
  now: () => Instant;
}>;

const create = (
  { client, targetResolver, likeUriResolver, cidResolver, savedStore, now }: Deps,
): LikeBlueskyPostUseCase => {
  const resolveByUri = async (uri: string): RA<BlueskyLikeTarget | undefined, BlueskyClientError> => {
    const cid = await cidResolver.resolve(uri);
    if (!cid.ok) return RA.err(cid.err);
    if (cid.val === undefined) return RA.ok(undefined);
    return RA.ok({ uri, cid: cid.val, likeUri: Result.unsafeUnwrap(await likeUriResolver.resolve(uri)) });
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const resolved = 'feedItemId' in input
      ? Result.ok(Result.unsafeUnwrap(await targetResolver.resolve(input.feedItemId)))
      : await resolveByUri(input.uri);
    if (!resolved.ok) return RA.err(resolved.err);
    const target = resolved.val;
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
