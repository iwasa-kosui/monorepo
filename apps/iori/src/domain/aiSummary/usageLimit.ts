import type { RA } from '@iwasa-kosui/result';

import type { Instant } from '../instant/instant.ts';
import type { UserId } from '../user/userId.ts';
import { DAY_MS, JST_OFFSET_MS } from './jst.ts';

export const DAILY_SUMMARY_LIMIT = 20;

export type AiSummaryUsageReservation = Readonly<{ allowed: boolean; count: number }>;

export type AiSummaryUsageRecorder = Readonly<{
  reserve: (input: Readonly<{ userId: UserId; day: string; limit: number }>) => RA<AiSummaryUsageReservation, never>;
  read: (input: Readonly<{ userId: UserId; day: string }>) => RA<number, never>;
}>;

export const secondsUntilNextJstDay = (now: Instant): number =>
  Math.ceil((DAY_MS - ((now + JST_OFFSET_MS) % DAY_MS)) / 1000);
