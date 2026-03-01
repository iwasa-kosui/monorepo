import z from 'zod/v4';

import type { Agg } from '../aggregate/index.ts';
import type { UserId } from '../user/userId.ts';
import type { Username } from '../user/username.ts';
import type { ActorId } from './actorId.ts';
import { LocalActor } from './localActor.ts';
import { RemoteActor } from './remoteActor.ts';
import { updateLogoUri } from './updateLogoUri.ts';

export type { LocalActor } from './localActor.ts';
export type { RemoteActor } from './remoteActor.ts';

export type Actor = LocalActor | RemoteActor;
export const Actor = {
  zodType: z.union([LocalActor.zodType, RemoteActor.zodType]).describe('Actor'),
  updateLogoUri,
  match: <T, U>({ onLocal, onRemote }: {
    onLocal: (localActor: LocalActor) => T;
    onRemote: (remoteActor: RemoteActor) => U;
  }) =>
  (actor: Actor): T | U => {
    switch (actor.type) {
      case 'local':
        return onLocal(actor);
      case 'remote':
        return onRemote(actor);
    }
  },
} as const;

export type ActorResolverByUri = Agg.Resolver<string, Actor | undefined>;
export type ActorResolverByUserId = Agg.Resolver<UserId, LocalActor | undefined>;

export type ActorsResolverByFollowerId = Agg.Resolver<ActorId, Actor[]>;
export type ActorsResolverByFollowingId = Agg.Resolver<ActorId, Actor[]>;
export type ActorAttributeResolver = Readonly<{
  getUri: (username: Username) => string;
}>;

export type ActorNotFoundError = Readonly<{
  type: 'ActorNotFoundError';
  message: string;
  detail: {
    uri: string;
  };
}>;

export const ActorNotFoundError = {
  create: (uri: string): ActorNotFoundError => ({
    type: 'ActorNotFoundError',
    message: `The actor with URI "${uri}" was not found.`,
    detail: { uri },
  }),
} as const;
