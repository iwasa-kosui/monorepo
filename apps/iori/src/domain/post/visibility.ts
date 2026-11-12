import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

const zodType = z.enum(['public', 'unlisted', 'private', 'direct']);
export type Visibility = z.infer<typeof zodType>;
const schema = Schema.create(zodType);

const publicAddresses: ReadonlySet<string> = new Set([
  'https://www.w3.org/ns/activitystreams#Public',
  'as:Public',
  'Public',
]);

export type VisibilityAddressing = Readonly<{
  to: ReadonlyArray<string>;
  cc: ReadonlyArray<string>;
  followersUri: string | null | undefined;
}>;

const fromAddressing = ({ to, cc, followersUri }: VisibilityAddressing): Visibility => {
  if (to.some((address) => publicAddresses.has(address))) {
    return 'public';
  }
  if (cc.some((address) => publicAddresses.has(address))) {
    return 'unlisted';
  }
  if (followersUri != null && [...to, ...cc].includes(followersUri)) {
    return 'private';
  }
  return 'direct';
};

const narrowness: Readonly<Record<Visibility, number>> = { public: 0, unlisted: 1, private: 2, direct: 3 };

const narrow = (stored: Visibility | null, incoming: Visibility | null): Visibility | null => {
  if (incoming === null) return stored;
  if (stored === null) return incoming === 'direct' ? incoming : null;
  return narrowness[incoming] > narrowness[stored] ? incoming : stored;
};

const isVisibleToAnonymous = (visibility: Visibility | null): boolean =>
  visibility === 'public' || visibility === 'unlisted';

export const Visibility = {
  ...schema,
  fromAddressing,
  narrow,
  isVisibleToAnonymous,
} as const;
