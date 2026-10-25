import { Application, Endpoints, Image, Person, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { UserResolverByUsername } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
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
      assertionMethods: keys.map((key) => key.multikey),
    });
  };

  const dispatch = (ctx: RequestContext<unknown>, identifier: string) => {
    if (identifier === INSTANCE_ACTOR_IDENTIFIER) return dispatchInstanceActor(ctx);
    return RA.flow(
      RA.ok(identifier),
      RA.andThen(Username.parse),
      RA.andThen((username) => userResolverByUsername.resolve(username)),
      RA.andThen((user) =>
        user === undefined ? RA.err(new Error(`User not found: ${identifier}`)) : actorResolverByUserId.resolve(user.id)
      ),
      RA.match({
        ok: async (actor) => {
          if (actor === undefined) return null;
          const keys = await ctx.getActorKeyPairs(identifier);
          return new Person({
            id: ctx.getActorUri(identifier),
            preferredUsername: identifier,
            inbox: ctx.getInboxUri(identifier),
            outbox: ctx.getOutboxUri(identifier),
            followers: ctx.getFollowersUri(identifier),
            endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
            url: ctx.getActorUri(identifier),
            icon: actor.logoUri === undefined
              ? undefined
              : new Image({ url: new URL(actor.logoUri), mediaType: 'image/png' }),
            publicKey: keys.at(0)?.cryptographicKey,
            assertionMethods: keys.map((key) => key.multikey),
          });
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
