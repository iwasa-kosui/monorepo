import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const BlockIdSym = Symbol('BlockId');
const zodType = z.uuid().brand(BlockIdSym).describe('BlockId');
export type BlockId = z.output<typeof zodType>;

const schema = Schema.create<BlockId, string>(zodType);

export const BlockId = {
  ...schema,
  generate: (): BlockId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
