import { createFederation } from '@fedify/fedify';
import { PostgresKvStore } from '@fedify/postgres';
import {
  Accept,
  Activity,
  Announce,
  Article,
  Block,
  Create,
  Delete,
  Follow,
  Like,
  Note,
  Reject,
  Undo,
} from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import postgres from 'postgres';

import { createActorDispatcher } from './adaptor/fedify/actorDispatcherFactory.ts';
import { FollowersDispatcher } from './adaptor/fedify/followersDispatcher.ts';
import { InboxListener } from './adaptor/fedify/inboxListener/inboxListener.ts';
import { KeyPairsDispatcher } from './adaptor/fedify/keyPairsDispatcher.ts';
import { ObjectDispatcher } from './adaptor/fedify/objectDispatcher.ts';
import { OutboxDispatcher } from './adaptor/fedify/outboxDispatcher.ts';
import { createOnRequestFinished } from './adaptor/fedify/relayForwardedCreate/onRequestFinished.ts';
import { defineRefetchRelayForwardedNoteTask } from './adaptor/fedify/relayForwardedCreate/refetchRelayForwardedNote.ts';
import { SharedKeyDispatcher } from './adaptor/fedify/sharedKeyDispatcher.ts';
import { ControlledQueue } from './adaptor/node/source/controlledQueue.ts';
import { postgresQueueStorage } from './adaptor/node/source/postgresQueueStorage.ts';
import { PgActorResolverByUri } from './adaptor/pg/actor/actorResolverByUri.ts';
import { PgActorResolverByUserId } from './adaptor/pg/actor/actorResolverByUserId.ts';
import { PgFederatedTimelineItemCreatedStore } from './adaptor/pg/federatedTimeline/federatedTimelineItemCreatedStore.ts';
import { PgFederatedTimelineItemResolverByPostId } from './adaptor/pg/federatedTimeline/federatedTimelineItemResolverByPostId.ts';
import { PgConfig } from './adaptor/pg/pgConfig.ts';
import { PgRemotePostUpserter } from './adaptor/pg/post/remotePostUpserter.ts';
import { PgRelayResolver } from './adaptor/pg/relay/relayResolver.ts';
import { PgRelayResolverByActorUri } from './adaptor/pg/relay/relayResolverByActorUri.ts';
import { PgUserResolverByUsername } from './adaptor/pg/user/userResolverByUsername.ts';
import { Username } from './domain/user/username.ts';
import { Env } from './env.ts';
import { createContextLoaderFactory } from './federationContext.ts';
import { singleton } from './helper/singleton.ts';
import { GetUserProfileUseCase } from './useCase/getUserProfile.ts';

const getQueue = singleton(() => {
  const env = Env.getInstance();
  return new ControlledQueue(postgresQueueStorage(
    postgres(env.DATABASE_URL, PgConfig.getInstance()),
    postgres(env.DATABASE_URL, { ...PgConfig.getInstance(), max: 1 }),
  ));
});

const create = () => {
  const env = Env.getInstance();
  const federation = createFederation({
    kv: new PostgresKvStore(postgres(env.DATABASE_URL, PgConfig.getInstance()), { unlogged: true }),
    queue: getQueue(),
    manuallyStartQueue: true,
    origin: env.ORIGIN,
    contextLoaderFactory: createContextLoaderFactory(),
    circuitBreaker: false,
  });
  const inboxListener = InboxListener.getInstance();
  const sharedKeyDispatcher = SharedKeyDispatcher.getInstance();
  const refetchRelayForwardedNoteTask = defineRefetchRelayForwardedNoteTask(federation, {
    origin: env.ORIGIN,
    relayResolver: PgRelayResolver.getInstance(),
    remotePostUpserter: PgRemotePostUpserter.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    federatedTimelineItemResolverByPostId: PgFederatedTimelineItemResolverByPostId.getInstance(),
    federatedTimelineItemCreatedStore: PgFederatedTimelineItemCreatedStore.getInstance(),
  });
  federation
    .setInboxListeners('/users/{identifier}/inbox', '/inbox')
    .withIdempotency('per-origin')
    .setSharedKeyDispatcher(sharedKeyDispatcher.dispatch)
    .on(Accept, inboxListener.onAccept)
    .on(Reject, inboxListener.onReject)
    .on(Follow, inboxListener.onFollow)
    .on(Block, inboxListener.onBlock)
    .on(Undo, inboxListener.onUndo)
    .on(Create, inboxListener.onCreate)
    .on(Delete, inboxListener.onDelete)
    .on(Like, inboxListener.onLike)
    .on(Announce, inboxListener.onAnnounce)
    .on(Activity, inboxListener.onActivity)
    .onRequestFinished(createOnRequestFinished({
      relayResolverByActorUri: PgRelayResolverByActorUri.getInstance(),
      enqueue: (ctx, data) => ctx.enqueueTask(refetchRelayForwardedNoteTask, data, { deduplicationKey: data.objectId }),
    }));

  federation.setObjectDispatcher(
    Note,
    '/users/{identifier}/posts/{id}',
    ObjectDispatcher.ofNote,
  );

  federation.setObjectDispatcher(
    Article,
    '/users/{identifier}/articles/{id}',
    ObjectDispatcher.ofArticle,
  );

  const followersDispatcher = FollowersDispatcher.getInstance();
  const outboxDispatcher = OutboxDispatcher.getInstance();
  const actorDispatcher = createActorDispatcher({
    userResolverByUsername: PgUserResolverByUsername.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
  });
  const keyPairsDispatcher = KeyPairsDispatcher.getInstance();

  federation
    .setFollowersDispatcher(
      '/users/{identifier}/followers',
      followersDispatcher.dispatch,
    )
    .setCounter((ctx, identifier) => {
      const useCase = GetUserProfileUseCase.getInstance();

      return RA.flow(
        RA.ok(Username.orThrow(identifier)),
        RA.andThen(async (username) => useCase.run({ username })),
        RA.match({
          ok: ({ followers }) => {
            getLogger().info(
              `Resolved followers for federation: ${identifier} - ${followers.length} followers`,
            );
            return followers.length;
          },
          err: (err) => {
            getLogger().warn(
              `Failed to resolve followers for federation: ${identifier} - ${err}`,
            );
            return 0;
          },
        }),
      );
    });

  federation.setOutboxDispatcher(
    '/users/{identifier}/outbox',
    outboxDispatcher.dispatch,
  );
  federation
    .setActorDispatcher('/users/{identifier}', actorDispatcher.dispatch)
    .setKeyPairsDispatcher(keyPairsDispatcher.dispatch);

  return federation;
};

const getInstance = singleton(create);

export const Federation = {
  getInstance,
  getQueue,
} as const;
