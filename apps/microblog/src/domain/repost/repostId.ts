import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const RepostIdSym = Symbol('RepostId');
const zodType = z.uuid().brand(RepostIdSym).describe('RepostId');
export type RepostId = z.output<typeof zodType>;

const schema = Schema.create<RepostId, string>(zodType);

export const RepostId = {
  ...schema,
  generate: (): RepostId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
