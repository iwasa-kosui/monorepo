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

type Resolved = Readonly<{ target: BlueskyRepostTarget; viewerRepostUri: string | null }>;

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
  const resolveByFeedItemId = async (feedItemId: string): RA<Resolved | undefined, BlueskyClientError> => {
    const target = Result.unsafeUnwrap(await targetResolver.resolve(feedItemId));
    if (target === undefined) return RA.ok(undefined);
    if (target.repostUri !== null) return RA.ok({ target, viewerRepostUri: null });
    const existing = await viewerRepostResolver.resolve(target.uri);
    if (!existing.ok) return RA.err(existing.err);
    return RA.ok({ target, viewerRepostUri: existing.val });
  };

  const resolveByUri = async (uri: string): RA<Resolved | undefined, BlueskyClientError> => {
    const subject = await cidResolver.resolve(uri);
    if (!subject.ok) return RA.err(subject.err);
    if (subject.val === undefined) return RA.ok(undefined);
    return RA.ok({
      target: { uri, cid: subject.val.cid, repostUri: Result.unsafeUnwrap(await repostUriResolver.resolve(uri)) },
      viewerRepostUri: subject.val.repostUri,
    });
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const resolved = 'feedItemId' in input
      ? await resolveByFeedItemId(input.feedItemId)
      : await resolveByUri(input.uri);
    if (!resolved.ok) return RA.err(resolved.err);
    if (resolved.val === undefined) return RA.err({ type: 'BlueskyRepostTargetNotFound' });
    const { target, viewerRepostUri } = resolved.val;
    if (target.repostUri !== null) return RA.ok({ reposted: true });
    if (viewerRepostUri !== null) {
      Result.unsafeUnwrap(
        await savedStore.save({ subjectUri: target.uri, repostUri: viewerRepostUri, createdAt: now() }),
      );
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
