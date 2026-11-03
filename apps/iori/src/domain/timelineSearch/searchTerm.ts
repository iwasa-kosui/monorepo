import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const SearchTermSym = Symbol('SearchTerm');

const MAX_BYTES = 48;
const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const hasLikeMetaCharacter = (value: string): boolean => /[%_\\％]/.test(value);

const zodType = z
  .string()
  .transform((value) => ({ raw: value.trim(), normalized: value.normalize('NFKC').trim() }))
  .pipe(
    z.object({
      raw: z.string(),
      normalized: z.string()
        .min(1)
        .refine((value) => utf8ByteLength(value) <= MAX_BYTES, `must be at most ${MAX_BYTES} bytes in UTF-8`)
        .refine((value) => !hasLikeMetaCharacter(value), 'must not contain %, _ or \\'),
    }).brand(SearchTermSym),
  )
  .describe('SearchTerm');

export type SearchTerm = z.output<typeof zodType>;

const schema = Schema.create<SearchTerm, string>(zodType);

const normalizeForMatch = (text: string): string => text.normalize('NFKC').toLowerCase();

const isLikePattern = (value: string): boolean =>
  value.length > 0 && utf8ByteLength(value) <= MAX_BYTES && !hasLikeMetaCharacter(value);

const patterns = (term: SearchTerm): string[] => [...new Set([term.raw, term.normalized])].filter(isLikePattern);

export const SearchTerm = {
  ...schema,
  normalizeForMatch,
  patterns,
} as const;
