import type { Context } from '@fedify/fedify';
import { Endpoints, Image, Person } from '@fedify/vocab';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import { plainTextToHtml } from '../../domain/post/plainTextToHtml.ts';

export const buildLocalPerson = async (
  ctx: Context<unknown>,
  identifier: string,
  actor: LocalActor,
): Promise<Person> => {
  const keys = await ctx.getActorKeyPairs(identifier);
  return new Person({
    id: ctx.getActorUri(identifier),
    preferredUsername: identifier,
    name: actor.displayName,
    summary: actor.bio === undefined ? undefined : plainTextToHtml(actor.bio),
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
};
