import type { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { Instant } from '../instant/instant.ts';

export const BlueskySyncScope = z.enum(['timeline', 'notifications']);
export type BlueskySyncScope = z.infer<typeof BlueskySyncScope>;

export const BlueskySyncFailureKind = z.enum(['auth', 'http', 'network', 'invalid_response', 'chat_not_permitted']);
export type BlueskySyncFailureKind = z.infer<typeof BlueskySyncFailureKind>;

const blueskySyncStatusRecordZodType = z.object({
  scope: BlueskySyncScope,
  lastSucceededAt: z.nullable(Instant.zodType),
  lastFailedAt: z.nullable(Instant.zodType),
  lastFailureKind: BlueskySyncFailureKind.nullable(),
  lastFailureCode: z.string().nullable(),
});

export type BlueskySyncStatusRecord = z.infer<typeof blueskySyncStatusRecordZodType>;
export const BlueskySyncStatusRecord = Schema.create(blueskySyncStatusRecordZodType);

export type BlueskySyncStatusResolver = Readonly<{
  resolve: () => RA<readonly BlueskySyncStatusRecord[], never>;
}>;
export type BlueskySyncSucceededStore = Readonly<{
  save: (scope: BlueskySyncScope, at: Instant) => RA<void, never>;
}>;
export type BlueskySyncFailedStore = Readonly<{
  save: (
    scope: BlueskySyncScope,
    at: Instant,
    kind: BlueskySyncFailureKind,
    code: string | null,
  ) => RA<void, never>;
}>;

export type BlueskySyncState = 'ok' | 'failing' | 'unknown';

export type BlueskyScopeConnectionStatus = Readonly<{
  state: BlueskySyncState;
  lastSucceededAt: Instant | null;
  lastFailedAt: Instant | null;
  failureKind: BlueskySyncFailureKind | null;
  failureCode: string | null;
}>;

export type BlueskyLoginConnectionStatus =
  | Readonly<{ state: 'ok' }>
  | Readonly<{ state: 'waiting'; failedAt: Instant; retryAt: Instant }>;

export type BlueskyConnectionStatus = Readonly<{
  timeline: BlueskyScopeConnectionStatus;
  notifications: BlueskyScopeConnectionStatus;
  login: BlueskyLoginConnectionStatus;
}>;

const toScopeStatus = (record: BlueskySyncStatusRecord | undefined): BlueskyScopeConnectionStatus => {
  if (record === undefined) {
    return { state: 'unknown', lastSucceededAt: null, lastFailedAt: null, failureKind: null, failureCode: null };
  }
  const failing = record.lastFailedAt !== null
    && (record.lastSucceededAt === null || record.lastFailedAt > record.lastSucceededAt);
  const unknown = record.lastSucceededAt === null && record.lastFailedAt === null;
  return {
    state: failing ? 'failing' : unknown ? 'unknown' : 'ok',
    lastSucceededAt: record.lastSucceededAt,
    lastFailedAt: record.lastFailedAt,
    failureKind: record.lastFailureKind,
    failureCode: record.lastFailureCode,
  };
};

export const toBlueskyConnectionStatus = (
  input: Readonly<{
    records: readonly BlueskySyncStatusRecord[];
    loginFailedAt: Instant | undefined;
    now: Instant;
    loginCooldownMs: number;
  }>,
): BlueskyConnectionStatus => {
  const find = (scope: BlueskySyncScope) => input.records.find((record) => record.scope === scope);
  const failedAt = input.loginFailedAt;
  const retryAt = failedAt === undefined ? undefined : Instant.addDuration(failedAt, input.loginCooldownMs);
  return {
    timeline: toScopeStatus(find('timeline')),
    notifications: toScopeStatus(find('notifications')),
    login: failedAt !== undefined && retryAt !== undefined && input.now < retryAt
      ? { state: 'waiting', failedAt, retryAt }
      : { state: 'ok' },
  };
};
