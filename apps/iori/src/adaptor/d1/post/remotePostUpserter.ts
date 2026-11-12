import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../../../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../../../domain/actor/updateLogoUri.ts';
import type { RemoteActorProfileUpdatedStore } from '../../../domain/actor/updateProfile.ts';
import type { PostImage, PostImageCreatedStore } from '../../../domain/image/image.ts';
import { ImageId } from '../../../domain/image/imageId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { PostResolverByUri } from '../../../domain/post/post.ts';
import {
  Post,
  type PostCreatedStore,
  type RemotePostIdentity,
  type RemotePostUpserter,
} from '../../../domain/post/post.ts';
import { upsertRemoteActor } from '../../../useCase/helper/upsertRemoteActor.ts';

type Deps = Readonly<{
  postResolverByUri: PostResolverByUri;
  postCreatedStore: PostCreatedStore;
  postImageCreatedStore: PostImageCreatedStore;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  remoteActorProfileUpdatedStore?: RemoteActorProfileUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
}>;

export const createD1RemotePostUpserter = (deps: Deps): RemotePostUpserter => ({
  resolve: async (identity: RemotePostIdentity) => {
    const existing = await deps.postResolverByUri.resolve({ uri: identity.uri });
    if (existing.ok && existing.val !== undefined) return RA.ok(existing.val);
    const now = Instant.now();
    const actor = await upsertRemoteActor({
      now,
      remoteActorCreatedStore: deps.remoteActorCreatedStore,
      logoUriUpdatedStore: deps.logoUriUpdatedStore,
      remoteActorProfileUpdatedStore: deps.remoteActorProfileUpdatedStore,
      actorResolverByUri: deps.actorResolverByUri,
    })(identity.authorIdentity);
    if (!actor.ok) throw new Error('Failed to upsert remote actor');
    const createdAt = identity.publishedAt !== undefined && identity.publishedAt < now ? identity.publishedAt : now;
    const event = Post.createRemotePost(createdAt)({
      content: identity.content,
      uri: identity.uri,
      actorId: actor.val.id,
      inReplyToUri: identity.inReplyToUri,
      summary: identity.summary,
      sensitive: identity.sensitive,
      visibility: identity.visibility,
      recipientActorUris: identity.recipientActorUris,
      quoteUri: identity.quoteUri,
    });
    await deps.postCreatedStore.store(event);
    const attachments = identity.attachments ?? [];
    if (attachments.length > 0) {
      const images: PostImage[] = attachments.map((attachment) => ({
        imageId: ImageId.generate(),
        postId: event.aggregateState.postId,
        url: attachment.url,
        altText: attachment.altText,
        mediaType: attachment.mediaType,
        createdAt: now,
      }));
      try {
        await deps.postImageCreatedStore.store(images);
      } catch (error) {
        getLogger().warn(`Failed to store images for remote post ${identity.uri}: ${String(error)}`);
      }
    }
    return RA.ok(event.aggregateState);
  },
});
