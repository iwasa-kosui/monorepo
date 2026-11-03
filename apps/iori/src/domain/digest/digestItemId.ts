import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const DigestItemIdSym = Symbol('DigestItemId');
const zodType = z.uuid().brand(DigestItemIdSym).describe('DigestItemId');
export type DigestItemId = z.output<typeof zodType>;

const schema = Schema.create<DigestItemId, string>(zodType);

export const DigestItemId = {
  ...schema,
  generate: (): DigestItemId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
