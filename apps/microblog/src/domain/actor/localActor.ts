import z from "zod";
import { ActorId } from "./actorId.ts";
import { UserId } from "../user/userId.ts";
import { createLocalActor } from "./createLocalActor.ts";

const zodType = z.object({
  id: ActorId.zodType,
  userId: UserId.zodType,
  uri: z.string(),
  inboxUrl: z.string(),
  type: z.literal('local'),
}).describe('LocalActor');

export type LocalActor = z.output<typeof zodType>;
export const LocalActor = {
  zodType,
  createLocalActor,
} as const;
