import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const SearchTermSym = Symbol('SearchTerm');

const MAX_BYTES = 48;
const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const zodType = z
  .string()
  .transform((value) => value.normalize('NFKC').trim())
  .pipe(
    z.string()
      .min(1)
      .refine((value) => utf8ByteLength(value) <= MAX_BYTES, `must be at most ${MAX_BYTES} bytes in UTF-8`)
      .refine((value) => !/[%_\\]/.test(value), 'must not contain %, _ or \\')
      .brand(SearchTermSym),
  )
  .describe('SearchTerm');

export type SearchTerm = z.output<typeof zodType>;

const schema = Schema.create<SearchTerm, string>(zodType);

const normalizeForMatch = (text: string): string => text.normalize('NFKC').toLowerCase();

export const SearchTerm = {
  ...schema,
  normalizeForMatch,
} as const;
