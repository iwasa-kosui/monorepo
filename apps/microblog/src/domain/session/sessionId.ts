import { z } from "zod/v4";

import { Schema } from "../../helper/schema.ts";

export const SessionIdSym = Symbol('SessionId');
const zodType = z.uuid().brand(SessionIdSym).describe('SessionId');
export type SessionId = z.core.output<typeof zodType>;

const schema = Schema.create<SessionId, string>(zodType);

export const SessionId = {
  ...schema,
  generate: (): SessionId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
