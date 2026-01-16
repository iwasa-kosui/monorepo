import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const UsernameSym = Symbol('Username');
const zodType = z.string().min(1).max(255).brand(UsernameSym).describe('Username');
export type Username = z.output<typeof zodType>;
const schema = Schema.create<Username, string>(zodType);

/**
 * Username はユーザーがログイン時に使用する識別子であり、一意である必要があります。
 * ただし、UserId とは異なり、将来的に変更される可能性があります。
 * 加えて、過去に存在したユーザー名が再利用されることも許容されます。
 */
export const Username = {
  ...schema,
} as const;
