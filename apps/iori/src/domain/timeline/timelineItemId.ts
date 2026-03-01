import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const TimelineItemIdSym = Symbol('TimelineItemId');
const zodType = z.uuid().brand(TimelineItemIdSym).describe('TimelineItemId');
export type TimelineItemId = z.output<typeof zodType>;

const schema = Schema.create<TimelineItemId, string>(zodType);

export const TimelineItemId = {
  ...schema,
  generate: (): TimelineItemId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
