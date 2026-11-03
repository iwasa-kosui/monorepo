import type { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { FeedSourceId } from '../feedSource/feedSourceId.ts';
import { Instant } from '../instant/instant.ts';
import { FeedEntryId } from './feedEntryId.ts';

export const FEED_ENTRY_DESCRIPTION_MAX_CHARS = 1000;

const zodType = z
  .object({
    feedEntryId: FeedEntryId.zodType,
    feedSourceId: FeedSourceId.zodType,
    guid: z.string().min(1),
    url: z.string().min(1),
    title: z.string().min(1),
    description: z.string().refine(
      (value) => Array.from(value).length <= FEED_ENTRY_DESCRIPTION_MAX_CHARS,
      { message: `description must be at most ${FEED_ENTRY_DESCRIPTION_MAX_CHARS} characters` },
    ),
    publishedAt: z.nullable(Instant.zodType),
    hatenaBookmarkCount: z.number().int().nonnegative().nullable(),
    fetchedAt: Instant.zodType,
  })
  .describe('FeedEntry');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type FeedEntry = z.output<typeof zodType>;
type ParseError = Extract<ReturnType<typeof schema.parse>, { ok: false }>['err'];
export type FeedEntryAggregateId = Readonly<{
  feedEntryId: FeedEntryId;
}>;
export type FeedEntryAggregate = Agg.Aggregate<FeedEntryAggregateId, 'feedEntry', FeedEntry>;
const toAggregateId = (feedEntry: FeedEntry): FeedEntryAggregateId => ({
  feedEntryId: feedEntry.feedEntryId,
});

type FeedEntryEvent<
  TAggregateState extends Agg.InferState<FeedEntryAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<FeedEntryAggregate, TAggregateState, TEventName, TEventPayload>;
const FeedEntryEvent = AggregateEvent.createFactory<FeedEntryAggregate>('feedEntry');

export type FeedEntryCollected = FeedEntryEvent<FeedEntry, 'feedEntry.collected', FeedEntry>;
export type FeedEntryBookmarkCountUpdated = FeedEntryEvent<
  FeedEntry,
  'feedEntry.bookmarkCountUpdated',
  { feedEntryId: FeedEntryId; hatenaBookmarkCount: number }
>;
export type FeedEntryExpired = FeedEntryEvent<undefined, 'feedEntry.expired', { feedEntryId: FeedEntryId }>;

const collect = (
  payload: Omit<FeedEntry, 'feedEntryId' | 'fetchedAt'>,
  now: Instant,
): Result<FeedEntryCollected, ParseError> => {
  const parsed = schema.parse({ ...payload, feedEntryId: FeedEntryId.generate(), fetchedAt: now });
  if (!parsed.ok) return parsed;
  const feedEntry = parsed.val;
  return {
    ...parsed,
    val: FeedEntryEvent.create(
      toAggregateId(feedEntry),
      feedEntry,
      'feedEntry.collected',
      feedEntry,
      now,
    ),
  };
};

const updateBookmarkCount = (
  feedEntry: FeedEntry,
  hatenaBookmarkCount: number,
  now: Instant,
): FeedEntryBookmarkCountUpdated => {
  const updated: FeedEntry = { ...feedEntry, hatenaBookmarkCount };
  return FeedEntryEvent.create(
    toAggregateId(updated),
    updated,
    'feedEntry.bookmarkCountUpdated',
    { feedEntryId: updated.feedEntryId, hatenaBookmarkCount },
    now,
  );
};

const expire = (feedEntry: FeedEntry, now: Instant): FeedEntryExpired =>
  FeedEntryEvent.create(
    toAggregateId(feedEntry),
    undefined,
    'feedEntry.expired',
    { feedEntryId: feedEntry.feedEntryId },
    now,
  );

export type FeedEntryCollectedStore = Agg.Store<FeedEntryCollected>;
export type FeedEntryBookmarkCountUpdatedStore = Agg.Store<FeedEntryBookmarkCountUpdated>;
export type FeedEntryExpiredStore = Agg.Store<FeedEntryExpired>;
export type FeedEntriesResolverByFeedSourceIdAndGuids = Agg.Resolver<
  { feedSourceId: FeedSourceId; guids: ReadonlyArray<string> },
  ReadonlyArray<FeedEntry>
>;
export type FeedEntriesResolverByFetchedBefore = Agg.Resolver<
  { fetchedBefore: Instant; limit: number },
  ReadonlyArray<FeedEntry>
>;

export const FeedEntry = {
  ...schema,
  collect,
  updateBookmarkCount,
  expire,
  toAggregateId,
} as const;
