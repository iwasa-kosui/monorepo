import z from "zod/v4";
import { ActorId } from "./actorId.ts";
import { UserId } from "../user/userId.ts";
import { createLocalActor } from "./createLocalActor.ts";

const zodType = z.object({
  id: ActorId.zodType,
  userId: UserId.zodType,
  uri: z.string(),
  inboxUrl: z.string(),
  type: z.literal('local'),
  logoUri: z.string().optional(),
}).describe('LocalActor');

export type LocalActor = z.output<typeof zodType>;

const getHandle = (localActor: LocalActor): string => {
  const parsedUrl = new URL(localActor.uri);
  return `${parsedUrl.href.replace('/users/', '')}@${parsedUrl.host}`;
}

export const LocalActor = {
  zodType,
  createLocalActor,
  getHandle,
} as const;
