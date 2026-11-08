import type { RA, Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { FeedSourceId } from './feedSourceId.ts';
import { blockedReason } from './feedSourceUrl.ts';
import { XUsername } from './xUsername.ts';

export const feedSourceKinds = ['rss', 'hatena_hotentry', 'hatena_entrylist', 'thoughtworks_radar', 'x_user'] as const;
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
export type FeedSourceParseError = ParseError;

const MAX_URL_LENGTH = 2048;

const feedUrlZodType = z
  .string()
  .max(MAX_URL_LENGTH)
  .transform((value, ctx) => {
    const fail = (message: string) => {
      ctx.issues.push({ code: 'custom', message, input: value });
      return z.NEVER;
    };
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return fail('Invalid URL');
    }
    const reason = blockedReason(url);
    if (reason !== undefined) return fail(reason);
    if (url.username !== '' || url.password !== '') return fail('URLs with credentials are not allowed');
    url.hash = '';
    if (url.href.length > MAX_URL_LENGTH) return fail(`URL must be at most ${MAX_URL_LENGTH} characters`);
    return url.href;
  });

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);

// x_user のプロフィール URL を rss として登録すると、同じ url の x_user を追加できなくなる。
const rssUrlZodType = feedUrlZodType.refine(
  (href) => !X_HOSTS.has(new URL(href).hostname.replace(/\.$/, '')),
  { message: 'x.com URLs are not allowed for rss' },
);

const newRssFeedSourceZodType = z.object({
  kind: z.literal('rss'),
  url: rssUrlZodType,
  title: z.string().min(1).max(100),
});
const newXUserFeedSourceZodType = z.object({
  kind: z.literal('x_user'),
  username: XUsername.zodType,
});
const newFeedSourceZodType = z
  .discriminatedUnion('kind', [newRssFeedSourceZodType, newXUserFeedSourceZodType])
  .transform((value) =>
    value.kind === 'rss'
      ? value
      : { kind: value.kind, url: XUsername.toProfileUrl(value.username), title: `@${value.username}` }
  )
  .describe('NewFeedSource');
const newFeedSourceSchema = Schema.create<z.output<typeof newFeedSourceZodType>, z.input<typeof newFeedSourceZodType>>(
  newFeedSourceZodType,
);
export type NewFeedSourceInput = z.input<typeof newFeedSourceZodType>;
export type NewFeedSource = z.output<typeof newFeedSourceZodType>;
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
export type FeedSourceEnabledChanged = FeedSourceEvent<
  FeedSource,
  'feedSource.enabledChanged',
  { feedSourceId: FeedSourceId; enabled: boolean; changedAt: Instant }
>;

export type FeedSourceNotFoundError = Readonly<{
  type: 'FeedSourceNotFoundError';
  message: string;
  detail: { feedSourceId: FeedSourceId };
}>;

export const FeedSourceNotFoundError = {
  create: (feedSourceId: FeedSourceId): FeedSourceNotFoundError => ({
    type: 'FeedSourceNotFoundError',
    message: `The feed source "${feedSourceId}" is not found.`,
    detail: { feedSourceId },
  }),
} as const;

export type FeedSourceAlreadyExistsError = Readonly<{
  type: 'FeedSourceAlreadyExistsError';
  message: string;
  detail: { url: string };
}>;

export const FeedSourceAlreadyExistsError = {
  create: (url: string): FeedSourceAlreadyExistsError => ({
    type: 'FeedSourceAlreadyExistsError',
    message: `The feed source "${url}" already exists.`,
    detail: { url },
  }),
} as const;

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

const setEnabled = (feedSource: FeedSource, enabled: boolean, now: Instant): FeedSourceEnabledChanged => {
  const updated: FeedSource = { ...feedSource, enabled };
  return FeedSourceEvent.create(
    toAggregateId(updated),
    updated,
    'feedSource.enabledChanged',
    { feedSourceId: updated.feedSourceId, enabled, changedAt: now },
    now,
  );
};

export const X_MANUAL_FETCH_MAX_SOURCES = 5;
export const X_MANUAL_FETCH_COOLDOWN_SECONDS = 300;

export type FeedSourceFetchReserver = Readonly<{
  reserve: (input: Readonly<{ feedSourceId: FeedSourceId; now: Instant }>) => RA<boolean, never>;
}>;

export type FeedSourceFetchCooldownError = Readonly<{
  type: 'FeedSourceFetchCooldownError';
  message: string;
  detail: { retryAfterSeconds: number };
}>;

export const FeedSourceFetchCooldownError = {
  create: (retryAfterSeconds: number): FeedSourceFetchCooldownError => ({
    type: 'FeedSourceFetchCooldownError',
    message: 'The feed sources were fetched too recently.',
    detail: { retryAfterSeconds },
  }),
} as const;

export type FeedSourceCreatedStore = Agg.Store<FeedSourceCreated>;
export type FeedSourceFetchedStore = Agg.Store<FeedSourceFetched>;
export type FeedSourceFetchFailedStore = Agg.Store<FeedSourceFetchFailed>;
export type FeedSourceEnabledChangedStore = Agg.Store<FeedSourceEnabledChanged>;
export type AllFeedSourcesResolver = Agg.Resolver<void, ReadonlyArray<FeedSource>>;
export type FeedSourcesResolverByEnabled = Agg.Resolver<{ enabled: boolean }, ReadonlyArray<FeedSource>>;

export const FeedSource = {
  ...schema,
  parseNew: newFeedSourceSchema.parse,
  createFeedSource,
  setEnabled,
  recordFetched,
  recordFetchFailed,
  toAggregateId,
} as const;
