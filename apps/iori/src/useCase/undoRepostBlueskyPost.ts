import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyRepostDeletedStore,
  blueskyRepostRkey,
  type BlueskyRepostTargetNotFound,
  type BlueskyRepostTargetResolver,
  type BlueskyRepostUriResolver,
} from '../domain/blueskyTimeline/blueskyRepost.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

type Ok = Readonly<{ reposted: false }>;

type Err = BlueskyClientError | BlueskyRepostTargetNotFound;

export type UndoRepostBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'deleteRepost'>;
  targetResolver: BlueskyRepostTargetResolver;
  repostUriResolver: BlueskyRepostUriResolver;
  deletedStore: BlueskyRepostDeletedStore;
}>;

const create = (
  { client, targetResolver, repostUriResolver, deletedStore }: Deps,
): UndoRepostBlueskyPostUseCase => {
  const run = async (input: Input): RA<Ok, Err> => {
    const target = 'feedItemId' in input
      ? Result.unsafeUnwrap(await targetResolver.resolve(input.feedItemId))
      : { uri: input.uri, repostUri: Result.unsafeUnwrap(await repostUriResolver.resolve(input.uri)) };
    if (target === undefined) return RA.err({ type: 'BlueskyRepostTargetNotFound' });
    if (target.repostUri === null) return RA.ok({ reposted: false });
    const rkey = blueskyRepostRkey(target.repostUri);
    if (rkey === undefined) {
      return RA.err({ type: 'BlueskyClientError', kind: 'invalid_response', message: 'stored repost uri is invalid' });
    }
    const deleted = await client.deleteRepost(rkey);
    if (!deleted.ok) return RA.err(deleted.err);
    Result.unsafeUnwrap(await deletedStore.deleteBySubjectUri(target.uri));
    return RA.ok({ reposted: false });
  };

  return { run };
};

export const UndoRepostBlueskyPostUseCase = {
  create,
} as const;
