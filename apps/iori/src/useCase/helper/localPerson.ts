import type { Context } from '@fedify/fedify';
import { Endpoints, Image, Person, Service } from '@fedify/vocab';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import { AiAgentBot } from '../../domain/aiAgentBot/aiAgentBot.ts';
import { plainTextToHtml } from '../../domain/post/plainTextToHtml.ts';

export const buildLocalPerson = async (
  ctx: Context<unknown>,
  identifier: string,
  actor: LocalActor,
): Promise<Person | Service> => {
  const keys = await ctx.getActorKeyPairs(identifier);
  // AI エージェントの bot は Service として公開し、Mastodon などで bot と表示されるようにする
  const isBot = AiAgentBot.isBotUsername(identifier);
  const ActorClass = isBot ? Service : Person;
  return new ActorClass({
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
    // 自分で設定したヘッダー画像を優先する。bot は未設定でも決まったカバー画像を出す
    image: actor.headerUri !== undefined
      ? new Image({ url: new URL(actor.headerUri) })
      : isBot
      ? new Image({ url: new URL(AiAgentBot.images.headerPath, ctx.origin), mediaType: 'image/png' })
      : undefined,
    publicKey: keys.at(0)?.cryptographicKey,
    assertionMethods: keys.map((key) => key.multikey),
  });
};
