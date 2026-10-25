import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../../../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../../../domain/actor/updateLogoUri.ts';
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
    return RA.ok(event.aggregateState);
  },
});
