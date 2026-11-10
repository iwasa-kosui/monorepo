import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const MediaIdSym = Symbol('MediaId');
const zodType = z.uuid().brand(MediaIdSym).describe('MediaId');
export type MediaId = z.output<typeof zodType>;

const schema = Schema.create<MediaId, string>(zodType);

export const MediaId = {
  ...schema,
  generate: (): MediaId => schema.orThrow(crypto.randomUUID()),
} as const;
