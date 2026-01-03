import { z } from "zod/v4";
import { Schema } from "../../helper/schema.ts";

export const PostIdSym = Symbol('PostId');
const zodType = z.uuid().brand(PostIdSym).describe('PostId');
export type PostId = z.output<typeof zodType>;

const schema = Schema.create<PostId, string>(zodType);

export const PostId = {
  ...schema,
  generate: (): PostId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
