import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const EmojiReactIdSym = Symbol('EmojiReactId');
const zodType = z.uuid().brand(EmojiReactIdSym).describe('EmojiReactId');
export type EmojiReactId = z.output<typeof zodType>;

const schema = Schema.create<EmojiReactId, string>(zodType);

export const EmojiReactId = {
  ...schema,
  generate: (): EmojiReactId => {
    const uuid = crypto.randomUUID();
    return schema.orThrow(uuid);
  },
} as const;
