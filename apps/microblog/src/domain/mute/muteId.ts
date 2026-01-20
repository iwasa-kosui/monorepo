import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const MuteIdSym = Symbol('MuteId');
const zodType = z.uuid().brand(MuteIdSym).describe('MuteId');
export type MuteId = z.output<typeof zodType>;

const schema = Schema.create<MuteId, string>(zodType);

export const MuteId = {
  ...schema,
  generate: (): MuteId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
