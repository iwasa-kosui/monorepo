import type { Actor } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

export type ActorIdentity = Readonly<{
  uri: string;
  inboxUrl: string;
  url: string | undefined;
  username: string | undefined;
}>;

export type ParseActorIdentityError = Readonly<{
  type: 'ParseActorIdentityError';
  message: string;
}>;

export const ParseActorIdentityError = {
  create: (message: string): ParseActorIdentityError => ({
    type: 'ParseActorIdentityError',
    message,
  }),
} as const;

export const ActorIdentity = {
  fromFedifyActor: async (actor: Actor): RA<ActorIdentity, ParseActorIdentityError> => {
    if (!actor.id) {
      return RA.err(ParseActorIdentityError.create('Actor id is missing'));
    }
    if (!actor.inboxId) {
      return RA.err(ParseActorIdentityError.create('Actor inboxId is missing'));
    }
    const icon = await actor.getIcon();
    return RA.ok({
      uri: actor.id.href,
      inboxUrl: actor.inboxId.href,
      url: actor.url?.href?.toString() ?? undefined,
      username: actor.preferredUsername?.toString() ?? undefined,
      logoUri: icon?.url?.href ?? undefined,
    });
  },
} as const;
