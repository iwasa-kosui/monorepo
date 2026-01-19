import { RA, type Result } from '@iwasa-kosui/result';

import type { ActorResolverByUri } from '../../../domain/actor/actor.ts';
import type { RemoteActorCreatedStore } from '../../../domain/actor/remoteActor.ts';
import type { LogoUriUpdatedStore } from '../../../domain/actor/updateLogoUri.ts';
import type { Agg } from '../../../domain/aggregate/index.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post, type PostCreatedStore, type RemotePost } from '../../../domain/post/post.ts';
import { singleton } from '../../../helper/singleton.ts';
import { upsertRemoteActor } from '../../../useCase/helper/upsertRemoteActor.ts';
import { PgActorResolverByUri } from '../actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../actor/remoteActorCreatedStore.ts';
import { PgPostCreatedStore } from './postCreatedStore.ts';
import type { PostResolverByUri } from './postResolverByUri.ts';
import { PgPostResolverByUri } from './postResolverByUri.ts';

type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string;
  username?: string;
  logoUri?: string;
}>;

export type RemotePostIdentity = Readonly<{
  uri: string;
  content: string;
  authorIdentity: ActorIdentity;
  inReplyToUri?: string | null;
}>;

export type RemotePostUpserter = Agg.Resolver<RemotePostIdentity, RemotePost>;

type Dependencies = Readonly<{
  postResolverByUri: PostResolverByUri;
  postCreatedStore: PostCreatedStore;
  remoteActorCreatedStore: RemoteActorCreatedStore;
  logoUriUpdatedStore: LogoUriUpdatedStore;
  actorResolverByUri: ActorResolverByUri;
}>;

const create = ({
  postResolverByUri,
  postCreatedStore,
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
    return RA.ok(createPost.aggregateState);
  };

  return { resolve };
};

const getInstance = singleton((): RemotePostUpserter => {
  return create({
    postResolverByUri: PgPostResolverByUri.getInstance(),
    postCreatedStore: PgPostCreatedStore.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
  });
});

export const PgRemotePostUpserter = {
  create,
  getInstance,
} as const;
