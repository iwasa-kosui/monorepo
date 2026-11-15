import { type RequestContext } from '@fedify/fedify';
import { Application, Endpoints, Tombstone } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import { AiAgentBot } from '../../domain/aiAgentBot/aiAgentBot.ts';
import type { UserResolverByUsername } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
import { buildLocalPerson } from '../../useCase/helper/localPerson.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from './sharedKeyDispatcher.ts';

export type ActorDispatcherDeps = Readonly<{
  userResolverByUsername: UserResolverByUsername;
  actorResolverByUserId: ActorResolverByUserId;
}>;

export const createActorDispatcher = ({ userResolverByUsername, actorResolverByUserId }: ActorDispatcherDeps) => {
  const dispatchInstanceActor = async (ctx: RequestContext<unknown>) => {
    const keys = await ctx.getActorKeyPairs(INSTANCE_ACTOR_IDENTIFIER);
    return new Application({
      id: ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER),
      preferredUsername: INSTANCE_ACTOR_IDENTIFIER,
      inbox: ctx.getInboxUri(INSTANCE_ACTOR_IDENTIFIER),
      outbox: ctx.getOutboxUri(INSTANCE_ACTOR_IDENTIFIER),
      followers: ctx.getFollowersUri(INSTANCE_ACTOR_IDENTIFIER),
      endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
      url: ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER),
      publicKey: keys.at(0)?.cryptographicKey,
      assertionMethods: keys.map((key) => key.multikey.clone({ id: key.keyId })),
    });
  };

  const dispatch = (ctx: RequestContext<unknown>, identifier: string) => {
    if (identifier === INSTANCE_ACTOR_IDENTIFIER) return dispatchInstanceActor(ctx);
    return RA.flow(
      RA.ok(identifier),
      RA.andThen(Username.parse),
      RA.andThen((username) => userResolverByUsername.resolve(username)),
      RA.andThen((user) => user === undefined ? RA.ok(undefined) : actorResolverByUserId.resolve(user.id)),
      RA.match({
        ok: async (actor) => {
          // 消した bot のアカウントは 410 Gone を返し、ほかのサーバーにアカウントが無くなったことを伝える
          if (actor === undefined && AiAgentBot.isRetiredUsername(identifier)) {
            return new Tombstone({ id: ctx.getActorUri(identifier) });
          }
          if (actor === undefined) return null;
          return buildLocalPerson(ctx, identifier, actor);
        },
        err: (error) => {
          getLogger().warn(`Failed to resolve user for federation: ${identifier} - ${error}`);
          return null;
        },
      }),
    );
  };

  return { dispatch };
};
