import type { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { FeedSourceId } from './feedSourceId.ts';

export const feedSourceKinds = ['rss', 'hatena_hotentry', 'hatena_entrylist', 'thoughtworks_radar'] as const;
const kindZodType = z.enum(feedSourceKinds);
export type FeedSourceKind = z.output<typeof kindZodType>;

const zodType = z
  .object({
    feedSourceId: FeedSourceId.zodType,
    kind: kindZodType,
    url: z.string().min(1),
    title: z.string().min(1),
    enabled: z.boolean(),
    etag: z.string().nullable(),
    lastModified: z.string().nullable(),
    lastFetchedAt: z.nullable(Instant.zodType),
    lastError: z.string().nullable(),
    createdAt: Instant.zodType,
  })
  .describe('FeedSource');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type FeedSource = z.output<typeof zodType>;
type ParseError = Extract<ReturnType<typeof schema.parse>, { ok: false }>['err'];
export type FeedSourceAggregateId = Readonly<{
  feedSourceId: FeedSourceId;
}>;
export type FeedSourceAggregate = Agg.Aggregate<FeedSourceAggregateId, 'feedSource', FeedSource>;
const toAggregateId = (feedSource: FeedSource): FeedSourceAggregateId => ({
  feedSourceId: feedSource.feedSourceId,
});

type FeedSourceEvent<
  TAggregateState extends Agg.InferState<FeedSourceAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<FeedSourceAggregate, TAggregateState, TEventName, TEventPayload>;
const FeedSourceEvent = AggregateEvent.createFactory<FeedSourceAggregate>('feedSource');

export type FeedSourceCreated = FeedSourceEvent<FeedSource, 'feedSource.created', FeedSource>;
export type FeedSourceFetched = FeedSourceEvent<
  FeedSource,
  'feedSource.fetched',
  { feedSourceId: FeedSourceId; etag: string | null; lastModified: string | null; lastFetchedAt: Instant }
>;
export type FeedSourceFetchFailed = FeedSourceEvent<
  FeedSource,
  'feedSource.fetchFailed',
  { feedSourceId: FeedSourceId; lastError: string; lastFetchedAt: Instant }
>;

const createFeedSource = (
  payload: Pick<FeedSource, 'kind' | 'url' | 'title'>,
  now: Instant,
): Result<FeedSourceCreated, ParseError> => {
  const parsed = schema.parse({
    ...payload,
    feedSourceId: FeedSourceId.generate(),
    enabled: true,
    etag: null,
    lastModified: null,
    lastFetchedAt: null,
    lastError: null,
    createdAt: now,
  });
  if (!parsed.ok) return parsed;
  const feedSource = parsed.val;
  return {
    ...parsed,
    val: FeedSourceEvent.create(
      toAggregateId(feedSource),
      feedSource,
      'feedSource.created',
      feedSource,
      now,
    ),
  };
};

const recordFetched = (
  feedSource: FeedSource,
  fetched: Readonly<{ etag: string | null; lastModified: string | null }>,
  now: Instant,
): FeedSourceFetched => {
  const updated: FeedSource = {
    ...feedSource,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    lastFetchedAt: now,
    lastError: null,
  };
  return FeedSourceEvent.create(
    toAggregateId(updated),
    updated,
    'feedSource.fetched',
    {
      feedSourceId: updated.feedSourceId,
      etag: updated.etag,
      lastModified: updated.lastModified,
      lastFetchedAt: now,
    },
    now,
  );
};

const recordFetchFailed = (feedSource: FeedSource, lastError: string, now: Instant): FeedSourceFetchFailed => {
  const updated: FeedSource = { ...feedSource, lastError, lastFetchedAt: now };
  return FeedSourceEvent.create(
    toAggregateId(updated),
    updated,
    'feedSource.fetchFailed',
    { feedSourceId: updated.feedSourceId, lastError, lastFetchedAt: now },
    now,
  );
};

export type FeedSourceCreatedStore = Agg.Store<FeedSourceCreated>;
export type FeedSourceFetchedStore = Agg.Store<FeedSourceFetched>;
export type FeedSourceFetchFailedStore = Agg.Store<FeedSourceFetchFailed>;
export type AllFeedSourcesResolver = Agg.Resolver<void, ReadonlyArray<FeedSource>>;
export type FeedSourcesResolverByEnabled = Agg.Resolver<{ enabled: boolean }, ReadonlyArray<FeedSource>>;

export const FeedSource = {
  ...schema,
  createFeedSource,
  recordFetched,
  recordFetchFailed,
  toAggregateId,
} as const;
