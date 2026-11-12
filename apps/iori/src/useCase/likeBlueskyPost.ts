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

type Resolved = Readonly<{ target: BlueskyLikeTarget; viewerLikeUri: string | null }>;

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
  const resolveByFeedItemId = async (feedItemId: string): RA<Resolved | undefined, BlueskyClientError> => {
    const target = Result.unsafeUnwrap(await targetResolver.resolve(feedItemId));
    return RA.ok(target === undefined ? undefined : { target, viewerLikeUri: null });
  };

  const resolveByUri = async (
    uri: string,
  ): RA<Resolved | undefined, BlueskyClientError> => {
    const subject = await cidResolver.resolve(uri);
    if (!subject.ok) return RA.err(subject.err);
    if (subject.val === undefined) return RA.ok(undefined);
    return RA.ok({
      target: { uri, cid: subject.val.cid, likeUri: Result.unsafeUnwrap(await likeUriResolver.resolve(uri)) },
      viewerLikeUri: subject.val.likeUri,
    });
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const resolved = 'feedItemId' in input
      ? await resolveByFeedItemId(input.feedItemId)
      : await resolveByUri(input.uri);
    if (!resolved.ok) return RA.err(resolved.err);
    if (resolved.val === undefined) return RA.err({ type: 'BlueskyLikeTargetNotFound' });
    const { target, viewerLikeUri } = resolved.val;
    if (target.likeUri !== null) return RA.ok({ liked: true });
    if (viewerLikeUri !== null) {
      Result.unsafeUnwrap(await savedStore.save({ subjectUri: target.uri, likeUri: viewerLikeUri, createdAt: now() }));
      return RA.ok({ liked: true });
    }
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
