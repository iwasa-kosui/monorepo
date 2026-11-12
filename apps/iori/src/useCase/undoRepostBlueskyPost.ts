import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyRepostDeletedStore,
  blueskyRepostRkey,
  type BlueskyRepostTargetNotFound,
  type BlueskyRepostTargetResolver,
  type BlueskyRepostUriResolver,
} from '../domain/blueskyTimeline/blueskyRepost.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../ports/blueskyPostCidResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

type Ok = Readonly<{ reposted: false }>;

type Err = BlueskyClientError | BlueskyRepostTargetNotFound;

export type UndoRepostBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'deleteRepost'>;
  targetResolver: BlueskyRepostTargetResolver;
  repostUriResolver: BlueskyRepostUriResolver;
  cidResolver: BlueskyPostCidResolver;
  deletedStore: BlueskyRepostDeletedStore;
}>;

const create = (
  { client, targetResolver, repostUriResolver, cidResolver, deletedStore }: Deps,
): UndoRepostBlueskyPostUseCase => {
  const resolveByUri = async (uri: string): RA<{ uri: string; repostUri: string | null }, BlueskyClientError> => {
    const stored = Result.unsafeUnwrap(await repostUriResolver.resolve(uri));
    if (stored !== null) return RA.ok({ uri, repostUri: stored });
    const subject = await cidResolver.resolve(uri);
    if (!subject.ok) return RA.err(subject.err);
    return RA.ok({ uri, repostUri: subject.val?.repostUri ?? null });
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const resolved = 'feedItemId' in input
      ? Result.ok(Result.unsafeUnwrap(await targetResolver.resolve(input.feedItemId)))
      : await resolveByUri(input.uri);
    if (!resolved.ok) return RA.err(resolved.err);
    const target = resolved.val;
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
