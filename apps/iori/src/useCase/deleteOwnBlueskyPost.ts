import type { RequestContext } from '@fedify/fedify';
import { RA, Result } from '@iwasa-kosui/result';

import type { PostIdsResolverByBlueskyUris } from '../domain/blueskyNotification/blueskyNotification.ts';
import type { BlueskyTimelineItemsDeletedStore } from '../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { BlueskyChatClient, BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { DeletePostUseCase } from './deletePost.ts';
import type { InferUseCaseError, UseCase } from './useCase.ts';

type Input = Readonly<{
  uri: string;
  userId: UserId;
  ctx: RequestContext<unknown>;
}>;

type Ok = Readonly<{ viaCrosspost: boolean }>;

export type BlueskyPostUriInvalid = Readonly<{ type: 'BlueskyPostUriInvalid' }>;

export type BlueskyPostNotOwned = Readonly<{ type: 'BlueskyPostNotOwned' }>;

type Err =
  | BlueskyClientError
  | BlueskyPostUriInvalid
  | BlueskyPostNotOwned
  | InferUseCaseError<DeletePostUseCase>;

export type DeleteOwnBlueskyPostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'deleteRecord'> & Pick<BlueskyChatClient, 'viewerDid'>;
  postIdsResolver: PostIdsResolverByBlueskyUris;
  deletePost: DeletePostUseCase;
  timelineItemsDeletedStore: BlueskyTimelineItemsDeletedStore;
}>;

const POST_COLLECTION = 'app.bsky.feed.post';
const atUriPattern = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/;

const create = (
  { client, postIdsResolver, deletePost, timelineItemsDeletedStore }: Deps,
): DeleteOwnBlueskyPostUseCase => {
  const run = async ({ uri, userId, ctx }: Input): RA<Ok, Err> => {
    const [, repo, collection, rkey] = atUriPattern.exec(uri) ?? [];
    if (repo === undefined || rkey === undefined || collection !== POST_COLLECTION) {
      return RA.err({ type: 'BlueskyPostUriInvalid' });
    }
    const viewer = await client.viewerDid();
    if (!viewer.ok) return RA.err(viewer.err);
    if (repo !== viewer.val) return RA.err({ type: 'BlueskyPostNotOwned' });
    const postId = Result.unsafeUnwrap(await postIdsResolver.resolve([uri])).get(uri);
    if (postId !== undefined) {
      const deleted = await deletePost.run({ userId, postId, ctx });
      return deleted.ok ? RA.ok({ viaCrosspost: true }) : RA.err(deleted.err);
    }
    const deleted = await client.deleteRecord(rkey);
    if (!deleted.ok) return RA.err(deleted.err);
    Result.unsafeUnwrap(await timelineItemsDeletedStore.deleteByUri(uri));
    return RA.ok({ viaCrosspost: false });
  };

  return { run };
};

export const DeleteOwnBlueskyPostUseCase = {
  create,
} as const;
