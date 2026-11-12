import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const ReportIdSym = Symbol('ReportId');
const zodType = z.uuid().brand(ReportIdSym).describe('ReportId');
export type ReportId = z.output<typeof zodType>;

const schema = Schema.create<ReportId, string>(zodType);

export const ReportId = {
  ...schema,
  generate: (): ReportId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
