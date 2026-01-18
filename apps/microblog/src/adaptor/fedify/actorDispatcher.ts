import { Application, Endpoints, Image, Person, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../domain/user/username.ts';
import { GetUserProfileUseCase } from '../../useCase/getUserProfile.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from './sharedKeyDispatcher.ts';

const getInstance = () => {
  const useCase = GetUserProfileUseCase.getInstance();

  const dispatchInstanceActor = async (ctx: RequestContext<unknown>) => {
    const keys = await ctx.getActorKeyPairs(INSTANCE_ACTOR_IDENTIFIER);
    return new Application({
      id: ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER),
      preferredUsername: INSTANCE_ACTOR_IDENTIFIER,
      inbox: ctx.getInboxUri(INSTANCE_ACTOR_IDENTIFIER),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
      url: ctx.getActorUri(INSTANCE_ACTOR_IDENTIFIER),
      publicKey: keys.at(0)?.cryptographicKey,
      assertionMethods: keys.map((k) => k.multikey),
    });
  };

  const dispatch = (ctx: RequestContext<unknown>, identifier: string) => {
    // Handle instance actor
    if (identifier === INSTANCE_ACTOR_IDENTIFIER) {
      return dispatchInstanceActor(ctx);
    }

    // Handle regular user actors
    return RA.flow(
      RA.ok(identifier),
      RA.andThen(Username.parse),
      RA.andThen(async (username) => useCase.run({ username })),
      RA.match({
        ok: async ({ user, actor }) => {
          const keys = await ctx.getActorKeyPairs(user.username);
          return new Person({
            id: ctx.getActorUri(user.username),
            preferredUsername: user.username,
            inbox: ctx.getInboxUri(identifier),
            outbox: ctx.getOutboxUri(identifier),
            endpoints: new Endpoints({
              sharedInbox: ctx.getInboxUri(),
            }),
            icon: actor.logoUri
              ? new Image({
                url: new URL(actor.logoUri),
                mediaType: 'image/png',
              })
              : undefined,
            url: ctx.getActorUri(identifier),
            publicKey: keys.at(0)?.cryptographicKey,
            assertionMethods: keys.map((k) => k.multikey),
            followers: ctx.getFollowersUri(identifier),
          });
        },
        err: (err) => {
          getLogger().warn(
            `Failed to resolve user for federation: ${identifier} - ${err}`,
          );
          return null;
        },
      }),
    );
  };

  return {
    dispatch,
  };
};

export const ActorDispatcher = {
  getInstance,
} as const;
