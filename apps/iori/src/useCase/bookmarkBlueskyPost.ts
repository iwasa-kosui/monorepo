import { RA, Result } from '@iwasa-kosui/result';

import type {
  BlueskyBookmarkSavedStore,
  BlueskyBookmarkTarget,
  BlueskyBookmarkTargetNotFound,
  BlueskyBookmarkTargetResolver,
} from '../domain/blueskyTimeline/blueskyBookmark.ts';
import type { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { BlueskyPostCidResolver } from '../ports/blueskyPostCidResolver.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

type Ok = Readonly<{ bookmarked: true }>;

type Err = BlueskyClientError | BlueskyBookmarkTargetNotFound;

export type BookmarkBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'createBookmark'>;
  targetResolver: BlueskyBookmarkTargetResolver;
  cidResolver: BlueskyPostCidResolver;
  savedStore: BlueskyBookmarkSavedStore;
  now: () => Instant;
}>;

const create = ({ client, targetResolver, cidResolver, savedStore, now }: Deps): BookmarkBlueskyPostUseCase => {
  const resolveByUri = async (uri: string): RA<BlueskyBookmarkTarget | undefined, BlueskyClientError> => {
    const subject = await cidResolver.resolve(uri);
    if (!subject.ok) return RA.err(subject.err);
    return RA.ok(subject.val === undefined ? undefined : { uri, cid: subject.val.cid });
  };

  const run = async (input: Input): RA<Ok, Err> => {
    const resolved = 'feedItemId' in input
      ? Result.ok(Result.unsafeUnwrap(await targetResolver.resolve(input.feedItemId)))
      : await resolveByUri(input.uri);
    if (!resolved.ok) return RA.err(resolved.err);
    const target = resolved.val;
    if (target === undefined) return RA.err({ type: 'BlueskyBookmarkTargetNotFound' });
    const created = await client.createBookmark({ uri: target.uri, cid: target.cid });
    if (!created.ok) return RA.err(created.err);
    Result.unsafeUnwrap(await savedStore.save({ subjectUri: target.uri, createdAt: now() }));
    return RA.ok({ bookmarked: true });
  };

  return { run };
};

export const BookmarkBlueskyPostUseCase = {
  create,
} as const;
