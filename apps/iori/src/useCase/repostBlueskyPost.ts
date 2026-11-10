import { RA, Result } from '@iwasa-kosui/result';

import {
  type BlueskyRepostSavedStore,
  type BlueskyRepostTargetNotFound,
  type BlueskyRepostTargetResolver,
  deriveBlueskyRepostRkey,
} from '../domain/blueskyTimeline/blueskyRepost.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyViewerRepostResolver } from '../ports/blueskyViewerRepostResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }>;

type Ok = Readonly<{ reposted: true }>;

type Err = BlueskyClientError | BlueskyRepostTargetNotFound;

export type RepostBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'createRepost'>;
  targetResolver: BlueskyRepostTargetResolver;
  viewerRepostResolver: BlueskyViewerRepostResolver;
  savedStore: BlueskyRepostSavedStore;
  now: () => Instant;
}>;

const create = ({ client, targetResolver, viewerRepostResolver, savedStore, now }: Deps): RepostBlueskyPostUseCase => {
  const run = async ({ feedItemId }: Input): RA<Ok, Err> => {
    const target = Result.unsafeUnwrap(await targetResolver.resolve(feedItemId));
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
