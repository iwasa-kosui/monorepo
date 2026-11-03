import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const MAX_QUERY_CHARS = 200;
export const MAX_QUERY_LIMIT = 40;
export const DEFAULT_QUERY_LIMIT = 20;

const zodType = z
  .object({
    text: z
      .string()
      .trim()
      .refine((value) => Array.from(value).length >= 1, 'must not be empty')
      .refine((value) => Array.from(value).length <= MAX_QUERY_CHARS, `must be at most ${MAX_QUERY_CHARS} characters`),
    limit: z.number().int().min(1).max(MAX_QUERY_LIMIT).default(DEFAULT_QUERY_LIMIT),
  })
  .describe('TimelineSearchQuery');

export type TimelineSearchQuery = z.output<typeof zodType>;

const schema = Schema.create<TimelineSearchQuery, z.input<typeof zodType>>(zodType);

export const TimelineSearchQuery = {
  ...schema,
} as const;
