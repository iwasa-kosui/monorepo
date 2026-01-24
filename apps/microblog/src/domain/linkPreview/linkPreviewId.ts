import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const LinkPreviewIdSym = Symbol('LinkPreviewId');
const zodType = z.uuid().brand(LinkPreviewIdSym).describe('LinkPreviewId');
export type LinkPreviewId = z.output<typeof zodType>;

const schema = Schema.create<LinkPreviewId, string>(zodType);

export const LinkPreviewId = {
  ...schema,
  generate: (): LinkPreviewId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
