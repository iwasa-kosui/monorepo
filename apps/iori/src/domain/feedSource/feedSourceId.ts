import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const FeedSourceIdSym = Symbol('FeedSourceId');
const zodType = z.uuid().brand(FeedSourceIdSym).describe('FeedSourceId');
export type FeedSourceId = z.output<typeof zodType>;

const schema = Schema.create<FeedSourceId, string>(zodType);

export const FeedSourceId = {
  ...schema,
  generate: (): FeedSourceId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
