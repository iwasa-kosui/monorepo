import z from "zod/v4";
import { ActorId } from "./actorId.ts";
import { ActorEvent } from "./aggregate.ts";
import type { Agg } from "../aggregate/index.ts";
import { Instant } from "../instant/instant.ts";

const zodType = z.object({
  id: ActorId.zodType,
  uri: z.string(),
  inboxUrl: z.string(),
  type: z.literal('remote'),
  username: z.string().optional(),
  url: z.string().optional(),
  logoUri: z.string().optional(),
}).describe('RemoteActor');


export type RemoteActor = z.output<typeof zodType>;
export type RemoteActorCreated = ActorEvent<RemoteActor, 'actor.created', {}>;
export type RemoteActorCreatedStore = Agg.Store<RemoteActorCreated>;

type CreateProps = Readonly<{
  uri: string;
  inboxUrl: string;
  url?: string
  username?: string
  logoUri?: string
}>;
const createRemoteActor = ({ uri, inboxUrl, url, username, logoUri }: CreateProps): RemoteActorCreated => {
  const remoteActor = {
    id: ActorId.generate(),
    uri,
    inboxUrl,
    url,
    username,
    type: 'remote' as const,
    logoUri,
  }
  return ActorEvent.create(
    remoteActor.id,
    remoteActor,
    'actor.created',
    {},
    Instant.now()
  )
}

const getHandle = (remoteActor: RemoteActor): string | undefined => {
  const { username, url } = remoteActor;
  if (!username || !url) {
    return undefined;
  }
  const parsedUrl = new URL(url);
  return `${username}@${parsedUrl.host}`;
}

export const RemoteActor = {
  zodType,
  createRemoteActor,
  getHandle,
} as const;
