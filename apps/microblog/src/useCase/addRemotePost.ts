import { RA } from '@iwasa-kosui/result';

import type { Actor } from '../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../domain/actor/updateLogoUri.ts';
import type { PostImage, PostImageCreatedStore } from '../domain/image/image.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Post, type PostCreatedStore, type RemotePostCreated } from '../domain/post/post.ts';
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
}>;

const create = ({
  postCreatedStore,
  postImageCreatedStore,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
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
        })(actorIdentity)),
      RA.andBind('post', ({ actor, content, uri }) => {
        const createPost = Post.createRemotePost(now)({
          content,
          uri,
          actorId: actor.id,
        });
        return postCreatedStore.store(createPost).then(() => RA.ok(createPost));
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
