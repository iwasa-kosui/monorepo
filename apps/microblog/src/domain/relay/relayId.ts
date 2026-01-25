import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const RelayIdSym = Symbol('RelayId');
const zodType = z.uuid().brand(RelayIdSym).describe('RelayId');
export type RelayId = z.output<typeof zodType>;

const schema = Schema.create<RelayId, string>(zodType);

export const RelayId = {
  ...schema,
  generate: (): RelayId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
