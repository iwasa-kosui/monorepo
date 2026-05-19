import { z } from 'zod';

export const SlackTsBrand = Symbol('SlackTs');
const SlackTsSchema = z.string().regex(/^\d+\.\d+$/).brand<typeof SlackTsBrand>();
export type SlackTs = z.infer<typeof SlackTsSchema>;

// `search.messages` の `after:YYYY-MM-DD` 用に、SlackTs から指定日数前の UTC 日付文字列を作る。
const toAfterDate = (ts: SlackTs, lookbackDays: number): string => {
  const epochSeconds = Math.floor(Number(ts));
  const date = new Date((epochSeconds - lookbackDays * 24 * 60 * 60) * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const fromEpochSeconds = (epochSeconds: number): SlackTs => SlackTsSchema.parse(`${Math.floor(epochSeconds)}.000000`);

export const SlackTs = {
  schema: SlackTsSchema,
  parse: (raw: unknown) => SlackTsSchema.safeParse(raw),
  fromEpochSeconds,
  isAfter: (a: SlackTs, b: SlackTs): boolean => a > b,
  max: (a: SlackTs, b: SlackTs): SlackTs => (a > b ? a : b),
  compareAsc: (a: SlackTs, b: SlackTs): number => (a < b ? -1 : a > b ? 1 : 0),
  toAfterDate,
} as const;
