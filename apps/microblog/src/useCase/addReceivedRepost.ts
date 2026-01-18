import { RA, type Result } from '@iwasa-kosui/result';

import type { PostResolverByUri } from '../adaptor/pg/post/postResolverByUri.ts';
import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  type LocalPost,
  Post,
  type PostCreatedStore,
  type PostResolver,
  type RemotePost,
} from '../domain/post/post.ts';
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

type RemotePostIdentity = Readonly<{
  uri: string;
  content: string;
  authorIdentity: ActorIdentity;
}>;

type LocalPostInput = Readonly<{
  type: 'local';
  announceActivityUri: string;
  repostedPostId: PostId;
  reposterIdentity: ActorIdentity;
  objectUri: string;
}>;

type RemotePostInput = Readonly<{
  type: 'remote';
  announceActivityUri: string;
  reposterIdentity: ActorIdentity;
  remotePostIdentity: RemotePostIdentity;
}>;

type Input = LocalPostInput | RemotePostInput;

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
  postResolverByUri: PostResolverByUri;
  postCreatedStore: PostCreatedStore;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  timelineItemCreatedStore: TimelineItemCreatedStore;
}>;

const isLocalPost = (post: LocalPost | RemotePost): post is LocalPost => post.type === 'local';

const create = ({
  repostCreatedStore,
  repostResolverByActivityUri,
  postResolver,
  postResolverByUri,
  postCreatedStore,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
  timelineItemCreatedStore,
}: Deps): AddReceivedRepostUseCase => {
  const runLocalPostRepost = async (input: LocalPostInput, now: Instant) => {
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

  const runRemotePostRepost = async (input: RemotePostInput, now: Instant) => {
    const objectUri = input.remotePostIdentity.uri;

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
            objectUri,
          }));
        }
        return RA.ok(rest);
      }),
      // Upsert the reposter (remote actor who did the repost)
      RA.andBind('actor', ({ reposterIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(reposterIdentity)),
      // Get or create the remote post being reposted
      RA.andBind('post', async ({ remotePostIdentity }): Promise<Result<RemotePost, never>> => {
        // First, check if the remote post already exists
        const existingPost = await postResolverByUri.resolve({ uri: remotePostIdentity.uri });
        if (existingPost.ok && existingPost.val) {
          return RA.ok(existingPost.val);
        }

        // If not, upsert the remote author and create the remote post
        const authorResult = await upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(remotePostIdentity.authorIdentity);

        if (!authorResult.ok) {
          // This should never happen as upsertRemoteActor returns Result<Actor, never>
          throw new Error('Failed to upsert remote actor');
        }

        const createPost = Post.createRemotePost(now)({
          content: remotePostIdentity.content,
          uri: remotePostIdentity.uri,
          actorId: authorResult.val.id,
        });
        await postCreatedStore.store(createPost);
        return RA.ok(createPost.aggregateState);
      }),
      // Create and store the repost
      RA.andBind('repost', ({ actor, announceActivityUri, post }) => {
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
      // Create TimelineItem for the repost
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

  const run = async (input: Input) => {
    const now = Instant.now();

    if (input.type === 'local') {
      return runLocalPostRepost(input, now);
    }
    return runRemotePostRepost(input, now);
  };

  return { run };
};

export const AddReceivedRepostUseCase = {
  create,
} as const;
