import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Instant } from '../instant/instant.ts';
import { MAX_QUERY_LIMIT, TimelineSearchQuery } from '../timelineSearch/timelineSearchQuery.ts';
import { DAY_MS } from './jst.ts';

export const MAX_SUMMARY_PERIOD_MS = 7 * DAY_MS;

export type SummaryTarget =
  | Readonly<{ type: 'search'; query: TimelineSearchQuery; since: Instant | undefined; until: Instant | undefined }>
  | Readonly<{ type: 'period'; since: Instant; until: Instant }>;

export type InvalidSummaryTargetField = 'body' | 'q' | 'since' | 'until';

export type InvalidSummaryTargetError = Readonly<{
  type: 'InvalidSummaryTargetError';
  field: InvalidSummaryTargetField;
  message: string;
}>;

export const InvalidSummaryTargetError = {
  create: (field: InvalidSummaryTargetField, message: string): InvalidSummaryTargetError => ({
    type: 'InvalidSummaryTargetError',
    field,
    message,
  }),
} as const;

const isoDatetime = z.iso.datetime({ offset: true });

const bodySchema = z.object({
  q: z.unknown().optional(),
  since: z.unknown().optional(),
  until: z.unknown().optional(),
});

const parseInstant = (
  field: 'since' | 'until',
  value: unknown,
): Result<Instant | undefined, InvalidSummaryTargetError> => {
  if (value === undefined) return Result.ok(undefined);
  const parsed = isoDatetime.safeParse(value);
  const instant = parsed.success ? Instant.of(Date.parse(parsed.data)) : undefined;
  return instant?.ok
    ? Result.ok(instant.val)
    : Result.err(InvalidSummaryTargetError.create(field, 'must be an ISO 8601 datetime'));
};

const parse = (
  input: unknown,
  now: Instant,
): Result<SummaryTarget, InvalidSummaryTargetError> => {
  const body = bodySchema.safeParse(input);
  if (!body.success) {
    return Result.err(InvalidSummaryTargetError.create('body', 'must be a JSON object'));
  }
  const since = parseInstant('since', body.data.since);
  if (!since.ok) return since;
  const until = parseInstant('until', body.data.until);
  if (!until.ok) return until;
  if (until.val !== undefined && until.val > now) {
    return Result.err(InvalidSummaryTargetError.create('until', 'must not be in the future'));
  }
  if (since.val !== undefined && until.val !== undefined) {
    if (since.val >= until.val) {
      return Result.err(InvalidSummaryTargetError.create('since', 'must be earlier than until'));
    }
    if (until.val - since.val > MAX_SUMMARY_PERIOD_MS) {
      return Result.err(InvalidSummaryTargetError.create('since', 'must be within 7 days of until'));
    }
  }
  if (body.data.q === undefined) {
    if (since.val === undefined) return Result.err(InvalidSummaryTargetError.create('since', 'is required'));
    if (until.val === undefined) return Result.err(InvalidSummaryTargetError.create('until', 'is required'));
    return Result.ok({ type: 'period', since: since.val, until: until.val });
  }
  const query = typeof body.data.q === 'string'
    ? TimelineSearchQuery.of({ text: body.data.q, limit: MAX_QUERY_LIMIT })
    : undefined;
  if (query === undefined || !query.ok) {
    return Result.err(InvalidSummaryTargetError.create('q', 'must be 1 to 200 characters'));
  }
  return Result.ok({ type: 'search', query: query.val, since: since.val, until: until.val });
};

export const SummaryTarget = {
  parse,
} as const;
