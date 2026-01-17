import { RA } from '@iwasa-kosui/result';

import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { LocalPost, Post, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import {
  AlreadyRepostedError,
  Repost,
  type RepostCreatedStore,
  type RepostResolverByActivityUri,
} from '../domain/repost/repost.ts';
import { RepostId } from '../domain/repost/repostId.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
}>;

type Input = Readonly<{
  announceActivityUri: string;
  repostedPostId: PostId;
  reposterIdentity: ActorIdentity;
  objectUri: string;
}>;

type Ok = Readonly<{
  repost: Repost;
  actor: Actor;
}>;

export type PostNotLocalError = Readonly<{
  type: 'PostNotLocalError';
  message: string;
  detail: {
    postId: PostId;
  };
}>;

export const PostNotLocalError = {
  create: (postId: PostId): PostNotLocalError => ({
    type: 'PostNotLocalError',
    message: `The post with ID "${postId}" is not a local post.`,
    detail: { postId },
  }),
} as const;

type Err = AlreadyRepostedError | PostNotLocalError;

export type AddReceivedRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  repostCreatedStore: RepostCreatedStore;
  repostResolverByActivityUri: RepostResolverByActivityUri;
  postResolver: PostResolver;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  timelineItemCreatedStore: TimelineItemCreatedStore;
}>;

const isLocalPost = (post: Post): post is LocalPost => post.type === 'local';

const create = ({
  repostCreatedStore,
  repostResolverByActivityUri,
  postResolver,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
  timelineItemCreatedStore,
}: Deps): AddReceivedRepostUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind(
        'existingRepost',
        ({ announceActivityUri }) => repostResolverByActivityUri.resolve({ announceActivityUri }),
      ),
      RA.andThen(({ existingRepost, ...rest }) => {
        if (existingRepost) {
          return RA.err(AlreadyRepostedError.create({
            actorId: existingRepost.actorId,
            objectUri: existingRepost.objectUri,
          }));
        }
        return RA.ok(rest);
      }),
      RA.andBind('post', ({ repostedPostId }) => postResolver.resolve(repostedPostId)),
      RA.andThen(({ post, ...rest }) => {
        if (!post || !isLocalPost(post)) {
          return RA.err(PostNotLocalError.create(rest.repostedPostId));
        }
        return RA.ok({ ...rest, post });
      }),
      RA.andBind('actor', ({ reposterIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(reposterIdentity)),
      RA.andBind('repost', ({ actor, objectUri, announceActivityUri, post }) => {
        const repostId = RepostId.generate();
        const repost: Repost = {
          repostId,
          actorId: actor.id,
          objectUri,
          originalPostId: post.postId,
          announceActivityUri,
        };
        const event = Repost.createRepost(repost, now);
        return repostCreatedStore.store(event).then(() => RA.ok(repost));
      }),
      RA.andThrough(({ repost, actor, post }) => {
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'repost',
          actorId: actor.id,
          postId: post.postId,
          repostId: repost.repostId,
          createdAt: now,
        }, now);
        return timelineItemCreatedStore.store(timelineItemEvent);
      }),
      RA.map(({ repost, actor }) => ({ repost, actor })),
    );
  };

  return { run };
};

export const AddReceivedRepostUseCase = {
  create,
} as const;
