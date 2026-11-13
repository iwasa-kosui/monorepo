import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const BlueskyAccountSwitchIdSym = Symbol('BlueskyAccountSwitchId');
const zodType = z.uuid().brand(BlueskyAccountSwitchIdSym).describe('BlueskyAccountSwitchId');
export type BlueskyAccountSwitchId = z.output<typeof zodType>;

const schema = Schema.create<BlueskyAccountSwitchId, string>(zodType);

export const BlueskyAccountSwitchId = {
  ...schema,
  generate: (): BlueskyAccountSwitchId => schema.orThrow(crypto.randomUUID()),
} as const;
