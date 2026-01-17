import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const NotificationIdSym = Symbol('NotificationId');
const zodType = z.uuid().brand(NotificationIdSym).describe('NotificationId');
export type NotificationId = z.output<typeof zodType>;

const schema = Schema.create<NotificationId, string>(zodType);

export const NotificationId = {
  ...schema,
  generate: (): NotificationId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
