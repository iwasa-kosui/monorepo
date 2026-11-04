import type { RA } from '@iwasa-kosui/result';

import type { Instant } from '../instant/instant.ts';
import type { UserId } from '../user/userId.ts';

export const DIGEST_DEEP_DIVE_DAILY_LIMIT = 3;

export type DigestDeepDiveReservation =
  | Readonly<{ allowed: true; remaining: number }>
  | Readonly<{ allowed: false; retryAfterSeconds: number }>;

export type DigestDeepDiveUsageRecorder = Readonly<{
  reserve: (input: Readonly<{ userId: UserId; day: string; now: Instant }>) => RA<DigestDeepDiveReservation, never>;
  remaining: (input: Readonly<{ userId: UserId; day: string }>) => RA<number, never>;
}>;
