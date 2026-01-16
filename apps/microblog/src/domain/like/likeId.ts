import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const LikeIdSym = Symbol('LikeId');
const zodType = z.uuid().brand(LikeIdSym).describe('LikeId');
export type LikeId = z.output<typeof zodType>;

const schema = Schema.create<LikeId, string>(zodType);

export const LikeId = {
  ...schema,
  generate: (): LikeId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
