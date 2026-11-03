import type { RA } from '@iwasa-kosui/result';

import type { UserId } from '../user/userId.ts';

export { secondsUntilNextJstDay } from '../aiSummary/usageLimit.ts';

export const DAILY_TRANSLATION_LIMIT = 50;

export type AiTranslationUsageReservation = Readonly<{ allowed: boolean; count: number }>;

export type AiTranslationUsageRecorder = Readonly<{
  reserve: (
    input: Readonly<{ userId: UserId; day: string; limit: number }>,
  ) => RA<AiTranslationUsageReservation, never>;
  read: (input: Readonly<{ userId: UserId; day: string }>) => RA<number, never>;
}>;
