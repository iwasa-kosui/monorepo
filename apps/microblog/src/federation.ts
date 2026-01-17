import { Create, createFederation, Delete, Follow, Like, Note, Undo } from '@fedify/fedify';
import { PostgresKvStore, PostgresMessageQueue } from '@fedify/postgres';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import postgres from 'postgres';

import { ActorDispatcher } from './adaptor/fedify/actorDispatcher.ts';
import { FollowersDispatcher } from './adaptor/fedify/followersDispatcher.ts';
import { InboxListener } from './adaptor/fedify/inboxListener/inboxListener.ts';
import { KeyPairsDispatcher } from './adaptor/fedify/keyPairsDispatcher.ts';
import { ObjectDispatcher } from './adaptor/fedify/objectDispatcher.ts';
import { OutboxDispatcher } from './adaptor/fedify/outboxDispatcher.ts';
import { PgConfig } from './adaptor/pg/pgConfig.ts';
import { Username } from './domain/user/username.ts';
import { Env } from './env.ts';
import { singleton } from './helper/singleton.ts';
import { GetUserProfileUseCase } from './useCase/getUserProfile.ts';

const create = () => {
  const env = Env.getInstance();
  const federation = createFederation({
    kv: new PostgresKvStore(postgres(env.DATABASE_URL, PgConfig.getInstance())),
    queue: new PostgresMessageQueue(
      postgres(env.DATABASE_URL, PgConfig.getInstance()),
    ),
    origin: env.ORIGIN,
  });
  const inboxListener = InboxListener.getInstance();
  federation
    .setInboxListeners('/users/{identifier}/inbox', '/inbox')
    .on(Follow, inboxListener.onFollow)
    .on(Undo, inboxListener.onUndo)
    .on(Create, inboxListener.onCreate)
    .on(Delete, inboxListener.onDelete)
    .on(Like, inboxListener.onLike);

  federation.setObjectDispatcher(
    Note,
    '/users/{identifier}/posts/{id}',
    ObjectDispatcher.ofNote,
  );

  const followersDispatcher = FollowersDispatcher.getInstance();
  const outboxDispatcher = OutboxDispatcher.getInstance();
  const actorDispatcher = ActorDispatcher.getInstance();
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
} as const;
