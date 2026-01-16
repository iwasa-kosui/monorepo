import z from "zod/v4";

import { Schema } from "../../helper/schema.ts";

export const ActorIdSym = Symbol('ActorId');
const ActorIdZodType = z.uuid().brand(ActorIdSym).describe('ActorId');
const ActorIdSchema = Schema.create<ActorId, string>(ActorIdZodType);

export type ActorId = z.output<typeof ActorIdZodType>;
export const ActorId = {
  ...ActorIdSchema,
  generate: (): ActorId => {
    const uuid = crypto.randomUUID();
    return ActorIdSchema.orThrow(uuid);
  },
}
