import type { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { ArticleId } from '../article/articleId.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { DigestId } from './digestId.ts';
import { DigestItemId } from './digestItemId.ts';

export const digestTrendKinds = ['timeline_link', 'hatena'] as const;
const trendKindZodType = z.enum(digestTrendKinds);
export type DigestTrendKind = z.output<typeof trendKindZodType>;

const digestItemZodType = z.object({
  digestItemId: DigestItemId.zodType,
  feedEntryId: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  rank: z.number().int().positive(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  reasonInterestSourceId: z.string().nullable(),
  feedback: z.string().nullable(),
});
export type DigestItem = z.output<typeof digestItemZodType>;

const digestTrendZodType = z.object({
  kind: trendKindZodType,
  rank: z.number().int().positive(),
  url: z.string().min(1),
  title: z.string().min(1),
  count: z.number().int().nonnegative(),
});
export type DigestTrend = z.output<typeof digestTrendZodType>;

const digestDateZodType = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('DigestDate');

const digestHeaderZodType = z.object({
  digestId: DigestId.zodType,
  userId: UserId.zodType,
  digestDate: digestDateZodType,
  articleId: ArticleId.zodType,
  createdAt: Instant.zodType,
  pushSentAt: z.nullable(Instant.zodType),
});
export type DigestHeader = z.output<typeof digestHeaderZodType>;

const zodType = digestHeaderZodType
  .extend({
    items: z.array(digestItemZodType),
    trends: z.array(digestTrendZodType),
  })
  .describe('Digest');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type Digest = z.output<typeof zodType>;
export type DigestParseError = Extract<ReturnType<typeof schema.parse>, { ok: false }>['err'];

export type DigestAggregateId = Readonly<{
  digestId: DigestId;
}>;
export type DigestAggregate = Agg.Aggregate<DigestAggregateId, 'digest', Digest>;
const toAggregateId = (digest: Pick<DigestHeader, 'digestId'>): DigestAggregateId => ({
  digestId: digest.digestId,
});

type DigestEvent<
  TAggregateState extends Agg.InferState<DigestAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<DigestAggregate, TAggregateState, TEventName, TEventPayload>;
const DigestEvent = AggregateEvent.createFactory<DigestAggregate>('digest');

export type DigestCreated = DigestEvent<Digest, 'digest.created', Digest>;
export type DigestPushSent = DigestEvent<
  Digest,
  'digest.pushSent',
  { digestId: DigestId; pushSentAt: Instant }
>;
export type DigestExpired = DigestEvent<
  undefined,
  'digest.expired',
  { digestId: DigestId; digestDate: string }
>;

export type CreateDigestPayload = Readonly<{
  userId: UserId;
  digestDate: string;
  articleId: ArticleId;
  items: ReadonlyArray<Omit<DigestItem, 'digestItemId'>>;
  trends: ReadonlyArray<DigestTrend>;
}>;

const create = (payload: CreateDigestPayload, now: Instant): Result<DigestCreated, DigestParseError> => {
  const parsed = schema.parse({
    ...payload,
    digestId: DigestId.generate(),
    createdAt: now,
    pushSentAt: null,
    items: payload.items.map((item) => ({ ...item, digestItemId: DigestItemId.generate() })),
  });
  if (!parsed.ok) return parsed;
  const digest = parsed.val;
  return {
    ...parsed,
    val: DigestEvent.create(toAggregateId(digest), digest, 'digest.created', digest, now),
  };
};

const recordPushSent = (digest: Digest, now: Instant): DigestPushSent => {
  const sent: Digest = { ...digest, pushSentAt: now };
  return DigestEvent.create(
    toAggregateId(sent),
    sent,
    'digest.pushSent',
    { digestId: sent.digestId, pushSentAt: now },
    now,
  );
};

const expire = (header: Pick<DigestHeader, 'digestId' | 'digestDate'>, now: Instant): DigestExpired =>
  DigestEvent.create(
    toAggregateId(header),
    undefined,
    'digest.expired',
    { digestId: header.digestId, digestDate: header.digestDate },
    now,
  );

export type DigestCreatedStore = Agg.Store<DigestCreated>;
export type DigestPushSentStore = Agg.Store<DigestPushSent>;
export type DigestExpiredStore = Agg.Store<DigestExpired>;
export type DigestHeaderResolverByUserIdAndDigestDate = Agg.Resolver<
  { userId: UserId; digestDate: string },
  DigestHeader | undefined
>;
export type DigestHeaderResolverByArticleId = Agg.Resolver<ArticleId, DigestHeader | undefined>;
export type DigestHeadersResolverByArticleIds = Agg.Resolver<ReadonlyArray<ArticleId>, ReadonlyArray<DigestHeader>>;
export type DigestResolverByUserIdAndDigestDate = Agg.Resolver<
  { userId: UserId; digestDate: string },
  Digest | undefined
>;
export type DigestResolverByUserId = Agg.Resolver<UserId, Digest | undefined>;
export type DigestHeadersResolverByDigestDateBefore = Agg.Resolver<
  { digestDateBefore: string; limit: number },
  ReadonlyArray<DigestHeader>
>;

export const Digest = {
  ...schema,
  create,
  recordPushSent,
  expire,
  toAggregateId,
} as const;
