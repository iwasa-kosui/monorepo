import { RA } from '@iwasa-kosui/result';

import type { Actor, ActorResolverByUri } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import type { PostImage, PostImageCreatedStore } from '../domain/image/image.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Post, type PostCreatedStore, type RemotePostCreated } from '../domain/post/post.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import { upsertRemoteActor } from './helper/upsertRemoteActor.ts';
import type { UseCase } from './useCase.ts';

type Attachment = Readonly<{
  url: string;
  altText: string | null;
}>;

type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
}>;

type Input = Readonly<{
  content: string;
  uri: string;
  actorIdentity: ActorIdentity;
  attachments: Attachment[];
  inReplyToUri?: string | null;
}>;

type Ok = Readonly<{
  post: RemotePostCreated;
  actor: Actor;
}>;

type Err = never;

export type AddRemotePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  postCreatedStore: PostCreatedStore;
  postImageCreatedStore: PostImageCreatedStore;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
  timelineItemCreatedStore: TimelineItemCreatedStore;
}>;

const create = ({
  postCreatedStore,
  postImageCreatedStore,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
  timelineItemCreatedStore,
}: Deps): AddRemotePostUseCase => {
  const run = async (input: Input) => {
    const now = Instant.now();

    return RA.flow(
      RA.ok(input),
      RA.andBind('actor', ({ actorIdentity }) =>
        upsertRemoteActor({
          now,
          remoteActorCreatedStore,
          logoUriUpdatedStore,
          actorResolverByUri,
        })(actorIdentity)),
      RA.andBind('post', ({ actor, content, uri, inReplyToUri }) => {
        const createPost = Post.createRemotePost(now)({
          content,
          uri,
          actorId: actor.id,
          inReplyToUri,
        });
        return postCreatedStore.store(createPost).then(() => RA.ok(createPost));
      }),
      RA.andThrough(({ post, actor }) => {
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'post',
          actorId: actor.id,
          postId: post.aggregateState.postId,
          repostId: null,
          createdAt: now,
        }, now);
        return timelineItemCreatedStore.store(timelineItemEvent);
      }),
      RA.andThrough(async ({ post, attachments }) => {
        if (attachments.length === 0) {
          return RA.ok(undefined);
        }
        const images: PostImage[] = attachments.map((attachment) => ({
          imageId: ImageId.generate(),
          postId: post.aggregateState.postId,
          url: attachment.url,
          altText: attachment.altText,
          createdAt: now,
        }));
        await postImageCreatedStore.store(images);
        return RA.ok(undefined);
      }),
      RA.map(({ post, actor }) => ({ post, actor })),
    );
  };

  return { run };
};

export const AddRemotePostUseCase = {
  create,
} as const;
