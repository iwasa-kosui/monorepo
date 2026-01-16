import { z } from "zod/v4";

import { Schema } from "../../helper/schema.ts";

export const ImageIdSym = Symbol('ImageId');
const zodType = z.uuid().brand(ImageIdSym).describe('ImageId');
export type ImageId = z.output<typeof zodType>;

const schema = Schema.create<ImageId, string>(zodType);

export const ImageId = {
  ...schema,
  generate: (): ImageId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
