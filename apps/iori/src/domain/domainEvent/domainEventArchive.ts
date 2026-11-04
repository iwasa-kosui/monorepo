import type { RA } from '@iwasa-kosui/result';

import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';

export const ARCHIVE_RETENTION_DAYS = 7;
export const ARCHIVE_SCHEMA_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ARCHIVE_RETAINED_EVENT_NAMES = ['actor.created'] as const;

export const ARCHIVE_REDACTED_EVENT_NAMES = [
  'key.created',
  'userPassword.set',
  'session.started',
  'accessToken.issued',
  'accessToken.revoked',
  'authorizationCode.issued',
  'authorizationCode.consumed',
  'oauthApplication.registered',
  'pushSubscription.created',
] as const;

export const ARCHIVE_HASHED_AGGREGATE_ID_EVENT_NAMES = ['session.started'] as const;

export type AggregateIdHasher = (aggregateId: string) => Promise<string>;

export type ArchivedDomainEvent = Readonly<{
  eventId: string;
  aggregateId: string;
  aggregateName: string;
  aggregateState: string | null;
  eventName: string;
  eventPayload: string | null;
  occurredAt: Instant;
}>;

export type ArchivableDomainEventsCondition = Readonly<{ cutoff: Instant; limit: number }>;
export type ArchivableDomainEventsResolver = Agg.Resolver<
  ArchivableDomainEventsCondition,
  ReadonlyArray<ArchivedDomainEvent>
>;

export type DomainEventArchiveWriteError = Readonly<{ type: 'DomainEventArchiveWriteError'; cause: unknown }>;
export const DomainEventArchiveWriteError = {
  create: (cause: unknown): DomainEventArchiveWriteError => ({ type: 'DomainEventArchiveWriteError', cause }),
} as const;

export type DomainEventArchiveWriter = Readonly<{
  write: (
    input: Readonly<{ key: string; events: ReadonlyArray<ArchivedDomainEvent> }>,
  ) => RA<void, DomainEventArchiveWriteError>;
}>;

export type ArchivedDomainEventsRange = Readonly<{
  first: ArchivedDomainEvent;
  last: ArchivedDomainEvent;
  cutoff: Instant;
}>;
export type ArchivedDomainEventsDeleter = Readonly<{
  deleteRange: (range: ArchivedDomainEventsRange) => RA<number, never>;
}>;

const utcDay = (instant: Instant): number => Math.floor(instant / DAY_MS);

const takeSameUtcDay = (events: ReadonlyArray<ArchivedDomainEvent>): ReadonlyArray<ArchivedDomainEvent> => {
  const first = events[0];
  if (first === undefined) return [];
  const day = utcDay(first.occurredAt);
  return events.filter((event) => utcDay(event.occurredAt) === day);
};

const redact =
  (hashAggregateId: AggregateIdHasher) => async (event: ArchivedDomainEvent): Promise<ArchivedDomainEvent> => {
    const redacted: ArchivedDomainEvent = (ARCHIVE_REDACTED_EVENT_NAMES as readonly string[]).includes(event.eventName)
      ? { ...event, aggregateState: null, eventPayload: null }
      : event;
    return (ARCHIVE_HASHED_AGGREGATE_ID_EVENT_NAMES as readonly string[]).includes(event.eventName)
      ? { ...redacted, aggregateId: `sha256:${await hashAggregateId(event.aggregateId)}` }
      : redacted;
  };

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

const objectKey = (first: ArchivedDomainEvent): string => {
  const date = new Date(first.occurredAt);
  return `domain-events/v1/year=${pad(date.getUTCFullYear(), 4)}/month=${pad(date.getUTCMonth() + 1, 2)}/day=${
    pad(date.getUTCDate(), 2)
  }/${first.occurredAt}-${first.eventId}.parquet`;
};

const cutoffOf = (now: Instant): Instant => Instant.addDuration(now, -ARCHIVE_RETENTION_DAYS * DAY_MS);

export const DomainEventArchive = {
  takeSameUtcDay,
  redact,
  objectKey,
  cutoffOf,
} as const;
