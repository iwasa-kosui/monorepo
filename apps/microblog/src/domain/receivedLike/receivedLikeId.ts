import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const ReceivedLikeIdSym = Symbol('ReceivedLikeId');
const zodType = z.uuid().brand(ReceivedLikeIdSym).describe('ReceivedLikeId');
export type ReceivedLikeId = z.output<typeof zodType>;

const schema = Schema.create<ReceivedLikeId, string>(zodType);

export const ReceivedLikeId = {
  ...schema,
  generate: (): ReceivedLikeId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
