import { RA, type Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../../../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../../../domain/actor/updateLogoUri.ts';
import type { PostImage, PostImageCreatedStore } from '../../../domain/image/image.ts';
import { ImageId } from '../../../domain/image/imageId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import {
  Post,
  type PostCreatedStore,
  type RemotePost,
  type RemotePostIdentity,
  type RemotePostUpserter,
} from '../../../domain/post/post.ts';
import { singleton } from '../../../helper/singleton.ts';
import { upsertRemoteActor } from '../../../useCase/helper/upsertRemoteActor.ts';
import { PgActorResolverByUri } from '../actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../actor/remoteActorCreatedStore.ts';
import { PgPostImageCreatedStore } from '../image/postImageCreatedStore.ts';
import { PgPostCreatedStore } from './postCreatedStore.ts';
import type { PostResolverByUri } from './postResolverByUri.ts';
import { PgPostResolverByUri } from './postResolverByUri.ts';

export type { RemotePostIdentity, RemotePostUpserter } from '../../../domain/post/post.ts';

type Dependencies = Readonly<{
  postResolverByUri: PostResolverByUri;
  postCreatedStore: PostCreatedStore;
  postImageCreatedStore: PostImageCreatedStore;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
}>;

const create = ({
  postResolverByUri,
  postCreatedStore,
  postImageCreatedStore,
  remoteActorCreatedStore,
  logoUriUpdatedStore,
  actorResolverByUri,
}: Dependencies): RemotePostUpserter => {
  const resolve = async (identity: RemotePostIdentity): Promise<Result<RemotePost, never>> => {
    const now = Instant.now();

    // First, check if the remote post already exists
    const existingPost = await postResolverByUri.resolve({ uri: identity.uri });
    if (existingPost.ok && existingPost.val) {
      return RA.ok(existingPost.val);
    }

    // If not, upsert the remote author and create the remote post
    const authorResult = await upsertRemoteActor({
      now,
      remoteActorCreatedStore,
      logoUriUpdatedStore,
      actorResolverByUri,
    })(identity.authorIdentity);

    if (!authorResult.ok) {
      // This should never happen as upsertRemoteActor returns Result<Actor, never>
      throw new Error('Failed to upsert remote actor');
    }

    const createPost = Post.createRemotePost(now)({
      content: identity.content,
      uri: identity.uri,
      actorId: authorResult.val.id,
      inReplyToUri: identity.inReplyToUri,
    });
    await postCreatedStore.store(createPost);
    const attachments = identity.attachments ?? [];
    if (attachments.length > 0) {
      const images: PostImage[] = attachments.map((attachment) => ({
        imageId: ImageId.generate(),
        postId: createPost.aggregateState.postId,
        url: attachment.url,
        altText: attachment.altText,
        createdAt: now,
      }));
      try {
        await postImageCreatedStore.store(images);
      } catch (error) {
        getLogger().warn(`Failed to store images for remote post ${identity.uri}: ${String(error)}`);
      }
    }
    return RA.ok(createPost.aggregateState);
  };

  return { resolve };
};

const getInstance = singleton((): RemotePostUpserter => {
  return create({
    postResolverByUri: PgPostResolverByUri.getInstance(),
    postCreatedStore: PgPostCreatedStore.getInstance(),
    postImageCreatedStore: PgPostImageCreatedStore.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
  });
});

export const PgRemotePostUpserter = {
  create,
  getInstance,
} as const;
