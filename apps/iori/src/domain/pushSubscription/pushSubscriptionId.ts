import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const PushSubscriptionIdSym = Symbol('PushSubscriptionId');
const zodType = z.uuid().brand(PushSubscriptionIdSym).describe('PushSubscriptionId');
export type PushSubscriptionId = z.output<typeof zodType>;

const schema = Schema.create<PushSubscriptionId, string>(zodType);

export const PushSubscriptionId = {
  ...schema,
  generate: (): PushSubscriptionId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
