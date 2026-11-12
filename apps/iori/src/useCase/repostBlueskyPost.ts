import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyRepostSavedStore,
  type BlueskyRepostTarget,
  type BlueskyRepostTargetNotFound,
  type BlueskyRepostTargetResolver,
  type BlueskyRepostUriResolver,
  deriveBlueskyRepostRkey,
} from '../domain/blueskyTimeline/blueskyRepost.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../ports/blueskyPostCidResolver.ts';
import type { BlueskyViewerRepostResolver } from '../ports/blueskyViewerRepostResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

type Ok = Readonly<{ reposted: true }>;

type Err = BlueskyClientError | BlueskyRepostTargetNotFound;

export type RepostBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'createRepost'>;
  targetResolver: BlueskyRepostTargetResolver;
  repostUriResolver: BlueskyRepostUriResolver;
  cidResolver: BlueskyPostCidResolver;
  viewerRepostResolver: BlueskyViewerRepostResolver;
  savedStore: BlueskyRepostSavedStore;
  now: () => Instant;
}>;

const create = (
  { client, targetResolver, repostUriResolver, cidResolver, viewerRepostResolver, savedStore, now }: Deps,
): RepostBlueskyPostUseCase => {
  const resolveByUri = async (uri: string): RA<BlueskyRepostTarget | undefined, BlueskyClientError> => {
    const cid = await cidResolver.resolve(uri);
    if (!cid.ok) return RA.err(cid.err);
    if (cid.val === undefined) return RA.ok(undefined);
    return RA.ok({ uri, cid: cid.val, repostUri: Result.unsafeUnwrap(await repostUriResolver.resolve(uri)) });
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const resolved = 'feedItemId' in input
      ? Result.ok(Result.unsafeUnwrap(await targetResolver.resolve(input.feedItemId)))
      : await resolveByUri(input.uri);
    if (!resolved.ok) return RA.err(resolved.err);
    const target = resolved.val;
    if (target === undefined) return RA.err({ type: 'BlueskyRepostTargetNotFound' });
    if (target.repostUri !== null) return RA.ok({ reposted: true });
    const existing = await viewerRepostResolver.resolve(target.uri);
    if (!existing.ok) return RA.err(existing.err);
    if (existing.val !== null) {
      Result.unsafeUnwrap(await savedStore.save({ subjectUri: target.uri, repostUri: existing.val, createdAt: now() }));
      return RA.ok({ reposted: true });
    }
    const created = await client.createRepost(
      { uri: target.uri, cid: target.cid },
      await deriveBlueskyRepostRkey(target.uri),
    );
    if (!created.ok) return RA.err(created.err);
    Result.unsafeUnwrap(
      await savedStore.save({ subjectUri: target.uri, repostUri: created.val.uri, createdAt: now() }),
    );
    return RA.ok({ reposted: true });
  };

  return { run };
};

export const RepostBlueskyPostUseCase = {
  create,
} as const;
