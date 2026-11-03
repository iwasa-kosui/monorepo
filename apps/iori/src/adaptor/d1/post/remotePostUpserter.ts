import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../../../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../../../domain/actor/updateLogoUri.ts';
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
      actorResolverByUri: deps.actorResolverByUri,
    })(identity.authorIdentity);
    if (!actor.ok) throw new Error('Failed to upsert remote actor');
    const event = Post.createRemotePost(now)({
      content: identity.content,
      uri: identity.uri,
      actorId: actor.val.id,
      inReplyToUri: identity.inReplyToUri,
    });
    await deps.postCreatedStore.store(event);
    const attachments = identity.attachments ?? [];
    if (attachments.length > 0) {
      const images: PostImage[] = attachments.map((attachment) => ({
        imageId: ImageId.generate(),
        postId: event.aggregateState.postId,
        url: attachment.url,
        altText: attachment.altText,
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
