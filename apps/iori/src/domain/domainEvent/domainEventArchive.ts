import type { RA } from '@iwasa-kosui/result';

import type { Agg } from '../aggregate/index.ts';
import type { FeedSourceKind } from '../feedSource/feedSource.ts';
import { Instant } from '../instant/instant.ts';

export const ARCHIVE_RETENTION_DAYS = 7;
export const ARCHIVE_SCHEMA_VERSION = 1;
export const ARCHIVE_BYTE_BUDGET = 16 * 1024 * 1024;
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
  // feedEntry のイベントは情報源の kind を持たず x_user の投稿を見分けられないので、RSS の分も伏せる
  'feedEntry.bookmarkCountUpdated',
  'feedEntry.collected',
  'feedEntry.embedded',
] as const;

// X の投稿は 7 日で消す約束なので、x_user の情報源のイベントだけ aggregateState の kind で伏せる
export const ARCHIVE_REDACTED_FEED_SOURCE_KINDS = ['x_user'] as const satisfies ReadonlyArray<FeedSourceKind>;
export const ARCHIVE_FEED_SOURCE_KIND_CHECKED_EVENT_NAMES = [
  'feedSource.created',
  'feedSource.enabledChanged',
  'feedSource.fetchFailed',
  'feedSource.fetched',
] as const;

export const ARCHIVE_PLAIN_EVENT_NAMES = [
  'actor.created',
  'actor.logoUriUpdated',
  'actor.profileUpdated',
  'article.created',
  'article.deleted',
  'article.published',
  'article.titleChanged',
  'article.unpublished',
  'articleBody.deleted',
  'articleBody.written',
  'digest.created',
  'digest.expired',
  'digest.itemFeedbackGiven',
  'digest.pushSent',
  'digestDeepDive.started',
  'digestDeepDive.turnAdded',
  'digestSubscription.saved',
  'digestTopic.created',
  'digestTopic.edited',
  'digestTopic.embedded',
  'digestTopic.enabledChanged',
  'digestTopic.materialWindowChanged',
  'emojiReact.emojiReactCreated',
  'emojiReact.emojiReactDeleted',
  'federatedTimelineItem.created',
  'federatedTimelineItem.deleted',
  'feedEntry.expired',
  'feedSource.created',
  'feedSource.enabledChanged',
  'feedSource.fetchFailed',
  'feedSource.fetched',
  'follow.followAccepted',
  'follow.followRequested',
  'follow.undoFollowingProcessed',
  'interestSource.contentChanged',
  'interestSource.created',
  'interestSource.deleted',
  'interestSource.embedded',
  'interestSource.embeddingCopied',
  'like.localLikeCreated',
  'like.localLikeDeleted',
  'like.remoteLikeCreated',
  'like.remoteLikeDeleted',
  'marker.markerSaved',
  'mediaUpload.created',
  'mediaUpload.descriptionUpdated',
  'mute.muteCreated',
  'mute.muteDeleted',
  'notification.emojiReactNotificationCreated',
  'notification.emojiReactNotificationDeleted',
  'notification.followNotificationCreated',
  'notification.likeNotificationCreated',
  'notification.likeNotificationDeleted',
  'notification.notificationDismissed',
  'notification.notificationsCleared',
  'notification.notificationsRead',
  'notification.replyNotificationCreated',
  'notification.replyNotificationDeleted',
  'notification.repostNotificationCreated',
  'post.created',
  'post.deleted',
  'post.remotePostCreated',
  'pushSubscription.deleted',
  'relay.subscriptionAccepted',
  'relay.subscriptionRequested',
  'relay.unsubscribed',
  'repost.repostCreated',
  'repost.repostDeleted',
  'timelineItem.created',
  'timelineItem.deleted',
  'user.created',
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

export type ArchivableDomainEventsCondition = Readonly<{ cutoff: Instant; limit: number; byteBudget: number }>;
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
  count: number;
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

const isPlain = (eventName: string): boolean => (ARCHIVE_PLAIN_EVENT_NAMES as readonly string[]).includes(eventName);

const unknownEventNames = (events: ReadonlyArray<ArchivedDomainEvent>): ReadonlyArray<string> =>
  [...new Set(events.map((event) => event.eventName))].filter((eventName) =>
    !isPlain(eventName) && !(ARCHIVE_REDACTED_EVENT_NAMES as readonly string[]).includes(eventName)
  );

const isRedactedFeedSourceState = (aggregateState: string | null): boolean => {
  try {
    const kind: unknown = JSON.parse(aggregateState ?? 'null')?.kind;
    return typeof kind !== 'string' || (ARCHIVE_REDACTED_FEED_SOURCE_KINDS as readonly string[]).includes(kind);
  } catch {
    return true;
  }
};

const isRedacted = (event: ArchivedDomainEvent): boolean =>
  !isPlain(event.eventName)
  || ((ARCHIVE_FEED_SOURCE_KIND_CHECKED_EVENT_NAMES as readonly string[]).includes(event.eventName)
    && isRedactedFeedSourceState(event.aggregateState));

const redact =
  (hashAggregateId: AggregateIdHasher) => async (event: ArchivedDomainEvent): Promise<ArchivedDomainEvent> => {
    const redacted: ArchivedDomainEvent = isRedacted(event)
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
  unknownEventNames,
  redact,
  objectKey,
  cutoffOf,
} as const;
