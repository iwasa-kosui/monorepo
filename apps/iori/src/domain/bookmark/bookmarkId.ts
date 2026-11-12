import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const BookmarkIdSym = Symbol('BookmarkId');
const zodType = z.uuid().brand(BookmarkIdSym).describe('BookmarkId');
export type BookmarkId = z.output<typeof zodType>;

const schema = Schema.create<BookmarkId, string>(zodType);

export const BookmarkId = {
  ...schema,
  generate: (): BookmarkId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
