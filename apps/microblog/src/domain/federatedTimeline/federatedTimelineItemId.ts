import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const FederatedTimelineItemIdSym = Symbol('FederatedTimelineItemId');
const zodType = z.uuid().brand(FederatedTimelineItemIdSym).describe('FederatedTimelineItemId');
export type FederatedTimelineItemId = z.output<typeof zodType>;

const schema = Schema.create<FederatedTimelineItemId, string>(zodType);

export const FederatedTimelineItemId = {
  ...schema,
  generate: (): FederatedTimelineItemId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
