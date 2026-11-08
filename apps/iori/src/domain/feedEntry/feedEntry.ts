import { ok, type RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { FeedSourceKind } from '../feedSource/feedSource.ts';
import { FeedSourceId } from '../feedSource/feedSourceId.ts';
import { Instant } from '../instant/instant.ts';
import { Embedding, type EmbeddingDimensionsError } from '../interestSource/embedding.ts';
import { FeedEntryId } from './feedEntryId.ts';

export const FEED_ENTRY_DESCRIPTION_MAX_CHARS = 1000;
export const FEED_ENTRY_KEY_MAX_CHARS = 2048;
export const FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS = 2000;

const zodType = z
  .object({
    feedEntryId: FeedEntryId.zodType,
    feedSourceId: FeedSourceId.zodType,
    guid: z.string().min(1).max(FEED_ENTRY_KEY_MAX_CHARS),
    url: z.string().min(1).max(FEED_ENTRY_KEY_MAX_CHARS),
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
export type FeedEntryEmbedded = FeedEntryEvent<
  FeedEntry,
  'feedEntry.embedded',
  { feedEntryId: FeedEntryId; embedding: Float32Array; embeddedAt: Instant }
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

const toEmbeddingText = (feedEntry: Pick<FeedEntry, 'title' | 'description'>): string =>
  Array.from(`${feedEntry.title}\n${feedEntry.description}`).slice(0, FEED_ENTRY_EMBEDDING_TEXT_MAX_CHARS).join('');

const embed = (
  feedEntry: FeedEntry,
  embedding: Float32Array,
  now: Instant,
): Result<FeedEntryEmbedded, EmbeddingDimensionsError> => {
  const validated = Embedding.validate(embedding);
  if (!validated.ok) return validated;
  return ok(
    FeedEntryEvent.create(
      toAggregateId(feedEntry),
      feedEntry,
      'feedEntry.embedded',
      { feedEntryId: feedEntry.feedEntryId, embedding: validated.val, embeddedAt: now },
      now,
    ),
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
export type FeedEntryEmbeddedStore = Agg.Store<FeedEntryEmbedded>;
export type FeedEntryExpiredStore =
  & Agg.Store<FeedEntryExpired>
  & Readonly<{
    storeWithEventPurge: (...events: readonly FeedEntryExpired[]) => RA<void, never>;
  }>;
export type FeedEntryEmbeddingResolverByFeedEntryId = Agg.Resolver<string, Float32Array | undefined>;
export type FeedEntryResolverByFeedEntryId = Agg.Resolver<string, FeedEntry | undefined>;
export type FeedEntriesResolverByFeedSourceIdAndGuids = Agg.Resolver<
  { feedSourceId: FeedSourceId; guids: ReadonlyArray<string> },
  ReadonlyArray<FeedEntry>
>;
export type FeedEntriesResolverByFetchedBefore = Agg.Resolver<
  {
    fetchedBefore: Instant;
    limit: number;
    kinds?: ReadonlyArray<FeedSourceKind>;
    excludedKinds?: ReadonlyArray<FeedSourceKind>;
  },
  ReadonlyArray<FeedEntry>
>;
export type FeedEntryMaxGuidResolverByFeedSourceId = Agg.Resolver<FeedSourceId, string | undefined>;
export type FeedEntriesResolverByFetchedSincePendingEmbedding = Agg.Resolver<
  { fetchedSince: Instant; limit: number },
  ReadonlyArray<FeedEntry>
>;
export type FeedEntriesResolverByFetchedSinceExcludingKinds = Agg.Resolver<
  { fetchedSince: Instant; excludedKinds: ReadonlyArray<FeedSourceKind>; limit: number },
  ReadonlyArray<FeedEntry>
>;

export const FeedEntry = {
  ...schema,
  collect,
  updateBookmarkCount,
  toEmbeddingText,
  embed,
  expire,
  toAggregateId,
} as const;
