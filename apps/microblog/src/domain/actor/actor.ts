import z from "zod";
import type { Agg } from "../aggregate/index.ts";
import type { UserId } from "../user/userId.ts";
import type { ActorId } from "./actorId.ts";
import { LocalActor } from "./localActor.ts";
import { RemoteActor } from "./remoteActor.ts";

export type Actor = LocalActor | RemoteActor
export const Actor = {
  zodType: z.union([LocalActor.zodType, RemoteActor.zodType]).describe('Actor'),
} as const;

export type ActorResolverByUri = Agg.Resolver<string, Actor | undefined>
export type ActorResolverByUserId = Agg.Resolver<UserId, LocalActor | undefined>

export type ActorsResolverByFollowerId = Agg.Resolver<ActorId, Actor[]>
export type ActorsResolverByFollowingId = Agg.Resolver<ActorId, Actor[]>

export type ActorNotFoundError = Readonly<{
  type: 'ActorNotFoundError';
  message: string;
  detail: {
    uri: string;
  }
}>;

export const ActorNotFoundError = {
  create: (uri: string): ActorNotFoundError => ({
    type: 'ActorNotFoundError',
    message: `The actor with URI "${uri}" was not found.`,
    detail: { uri },
  }),
} as const;
