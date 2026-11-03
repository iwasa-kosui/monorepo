import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const DigestIdSym = Symbol('DigestId');
const zodType = z.uuid().brand(DigestIdSym).describe('DigestId');
export type DigestId = z.output<typeof zodType>;

const schema = Schema.create<DigestId, string>(zodType);

export const DigestId = {
  ...schema,
  generate: (): DigestId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
