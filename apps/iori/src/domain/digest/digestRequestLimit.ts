import type { RA } from '@iwasa-kosui/result';

import type { Instant } from '../instant/instant.ts';
import type { UserId } from '../user/userId.ts';

export const DIGEST_REQUEST_DAILY_LIMIT = 3;
export const DIGEST_REQUEST_MIN_INTERVAL_MS = 120_000;

export type DigestRequestReservation =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason: 'daily_limit' | 'too_soon'; retryAfterSeconds: number }>;

export type DigestRequestUsageRecorder = Readonly<{
  reserve: (input: Readonly<{ userId: UserId; day: string; now: Instant }>) => RA<DigestRequestReservation, never>;
}>;
