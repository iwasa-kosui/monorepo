import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const InterestSourceIdSym = Symbol('InterestSourceId');
const zodType = z.uuid().brand(InterestSourceIdSym).describe('InterestSourceId');
export type InterestSourceId = z.output<typeof zodType>;

const schema = Schema.create<InterestSourceId, string>(zodType);

export const InterestSourceId = {
  ...schema,
  generate: (): InterestSourceId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
