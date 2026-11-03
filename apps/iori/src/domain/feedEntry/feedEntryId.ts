import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const FeedEntryIdSym = Symbol('FeedEntryId');
const zodType = z.uuid().brand(FeedEntryIdSym).describe('FeedEntryId');
export type FeedEntryId = z.output<typeof zodType>;

const schema = Schema.create<FeedEntryId, string>(zodType);

export const FeedEntryId = {
  ...schema,
  generate: (): FeedEntryId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
