import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const XUsernameSym = Symbol('XUsername');
const zodType = z.string().regex(/^[A-Za-z0-9_]{1,15}$/).brand(XUsernameSym).describe('XUsername');
export type XUsername = z.output<typeof zodType>;

const schema = Schema.create<XUsername, string>(zodType);

// X のユーザー名は大文字小文字を区別しないので、URL は小文字にそろえて重複登録を防ぐ
const toProfileUrl = (username: XUsername): string => `https://x.com/${username.toLowerCase()}`;

const toStatusUrl = (username: XUsername, postId: string): string => `https://x.com/${username}/status/${postId}`;

const fromProfileUrl = (url: string): XUsername | undefined => {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const parsed = schema.parse(pathname.replace(/^\//, ''));
  return parsed.ok ? parsed.val : undefined;
};

export const XUsername = {
  ...schema,
  toProfileUrl,
  toStatusUrl,
  fromProfileUrl,
} as const;
