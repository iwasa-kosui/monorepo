import { RA, Result } from '@iwasa-kosui/result';

import type {
  BlueskyBookmarkDeletedStore,
  BlueskyBookmarkTargetNotFound,
  BlueskyBookmarkTargetResolver,
} from '../domain/blueskyTimeline/blueskyBookmark.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ feedItemId: string }> | Readonly<{ uri: string }>;

type Ok = Readonly<{ bookmarked: false }>;

type Err = BlueskyClientError | BlueskyBookmarkTargetNotFound;

export type UnbookmarkBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'deleteBookmark'>;
  targetResolver: BlueskyBookmarkTargetResolver;
  deletedStore: BlueskyBookmarkDeletedStore;
}>;

const create = ({ client, targetResolver, deletedStore }: Deps): UnbookmarkBlueskyPostUseCase => {
  const run = async (input: Input): RA<Ok, Err> => {
    const uri = 'feedItemId' in input
      ? (Result.unsafeUnwrap(await targetResolver.resolve(input.feedItemId)))?.uri
      : input.uri;
    if (uri === undefined) return RA.err({ type: 'BlueskyBookmarkTargetNotFound' });
    const deleted = await client.deleteBookmark(uri);
    if (!deleted.ok) return RA.err(deleted.err);
    Result.unsafeUnwrap(await deletedStore.deleteBySubjectUri(uri));
    return RA.ok({ bookmarked: false });
  };

  return { run };
};

export const UnbookmarkBlueskyPostUseCase = {
  create,
} as const;
