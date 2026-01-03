import z from "zod";
import { ActorId } from "./actorId.ts";
import { UserId } from "../user/userId.ts";
import { ActorEvent } from "./aggregate.ts";
import type { Agg } from "../aggregate/index.ts";
import { Instant } from "../instant/instant.ts";

const zodType = z.object({
  id: ActorId.zodType,
  uri: z.string(),
  inboxUrl: z.string(),
  type: z.literal('remote'),
}).describe('RemoteActor');


export type RemoteActor = z.output<typeof zodType>;
export type RemoteActorCreated = ActorEvent<RemoteActor, 'actor.created', {}>;
export type RemoteActorCreatedStore = Agg.Store<RemoteActorCreated>;

const createRemoteActor = (uri: string, inboxUrl: string): RemoteActorCreated => {
  const remoteActor = {
    id: ActorId.generate(),
    uri,
    inboxUrl,
    type: 'remote' as const,
  }
  return ActorEvent.create(
    remoteActor.id,
    remoteActor,
    'actor.created',
    {},
    Instant.now()
  )
}

export const RemoteActor = {
  zodType,
  createRemoteActor,
} as const;
