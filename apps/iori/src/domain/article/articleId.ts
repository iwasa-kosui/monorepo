import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const ArticleIdSym = Symbol('ArticleId');
const zodType = z.uuid().brand(ArticleIdSym).describe('ArticleId');
export type ArticleId = z.output<typeof zodType>;

const schema = Schema.create<ArticleId, string>(zodType);

export const ArticleId = {
  ...schema,
  generate: (): ArticleId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
