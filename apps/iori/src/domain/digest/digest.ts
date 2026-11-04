import { err, ok, type Result } from '@iwasa-kosui/result';
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

export const digestTriggers = ['scheduled', 'requested'] as const;
const digestTriggerZodType = z.enum(digestTriggers);
export type DigestTrigger = z.output<typeof digestTriggerZodType>;
export const DigestTrigger = {
  zodType: digestTriggerZodType,
} as const;

export const digestFeedbackKinds = ['interested', 'not_interested'] as const;
const digestFeedbackZodType = z.enum(digestFeedbackKinds);
export type DigestFeedback = z.output<typeof digestFeedbackZodType>;
export const DigestFeedback = {
  zodType: digestFeedbackZodType,
} as const;

const digestItemZodType = z.object({
  digestItemId: DigestItemId.zodType,
  feedEntryId: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  rank: z.number().int().positive(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  reasonInterestSourceId: z.string().nullable(),
  feedback: digestFeedbackZodType.nullable(),
  feedbackAt: z.nullable(Instant.zodType),
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
  trigger: digestTriggerZodType,
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
export type DigestItemFeedbackGiven = DigestEvent<
  Digest,
  'digest.itemFeedbackGiven',
  { digestItemId: DigestItemId; feedback: DigestFeedback | null; feedbackAt: Instant | null }
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
  trigger: DigestTrigger;
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

export type DigestItemNotFoundError = Readonly<{
  type: 'DigestItemNotFoundError';
  message: string;
  detail: { digestItemId: DigestItemId };
}>;

export const DigestItemNotFoundError = {
  create: (digestItemId: DigestItemId): DigestItemNotFoundError => ({
    type: 'DigestItemNotFoundError',
    message: `The digest item "${digestItemId}" is not found.`,
    detail: { digestItemId },
  }),
} as const;

export type DigestArticlePublishedError = Readonly<{
  type: 'DigestArticlePublishedError';
  message: string;
  detail: { articleId: ArticleId };
}>;

export const DigestArticlePublishedError = {
  create: (articleId: ArticleId): DigestArticlePublishedError => ({
    type: 'DigestArticlePublishedError',
    message: `The article "${articleId}" of the digest has already been published.`,
    detail: { articleId },
  }),
} as const;

const giveFeedback = (
  digest: Digest,
  digestItemId: DigestItemId,
  feedback: DigestFeedback,
  now: Instant,
): Result<DigestItemFeedbackGiven, DigestItemNotFoundError> => {
  const item = digest.items.find((candidate) => candidate.digestItemId === digestItemId);
  if (item === undefined) return err(DigestItemNotFoundError.create(digestItemId));
  const next = item.feedback === feedback ? null : feedback;
  const feedbackAt = next === null ? null : now;
  const updated: Digest = {
    ...digest,
    items: digest.items.map((candidate) =>
      candidate.digestItemId === digestItemId ? { ...candidate, feedback: next, feedbackAt } : candidate
    ),
  };
  return ok(DigestEvent.create(
    toAggregateId(updated),
    updated,
    'digest.itemFeedbackGiven',
    { digestItemId, feedback: next, feedbackAt },
    now,
  ));
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
export type DigestItemFeedbackGivenStore = Agg.Store<DigestItemFeedbackGiven>;
export type DigestExpiredStore = Agg.Store<DigestExpired>;
export type DigestHeaderResolverByUserIdAndDigestDate = Agg.Resolver<
  { userId: UserId; digestDate: string },
  DigestHeader | undefined
>;
export type DigestHeaderResolverByArticleId = Agg.Resolver<ArticleId, DigestHeader | undefined>;
export type LatestDigestHeaderResolverByUserId = Agg.Resolver<
  { userId: UserId; excludingDigestId: DigestId | undefined },
  DigestHeader | undefined
>;
export type DigestHeadersResolverByArticleIds = Agg.Resolver<ReadonlyArray<ArticleId>, ReadonlyArray<DigestHeader>>;
export type DigestResolverByUserIdAndDigestDate = Agg.Resolver<
  { userId: UserId; digestDate: string },
  Digest | undefined
>;
export type DigestResolverByUserId = Agg.Resolver<UserId, Digest | undefined>;
export type DigestResolverByDigestItemId = Agg.Resolver<DigestItemId, Digest | undefined>;
export type DigestHeadersResolverByDigestDateBefore = Agg.Resolver<
  { digestDateBefore: string; limit: number },
  ReadonlyArray<DigestHeader>
>;

export type DigestAlreadyPublishedError = Readonly<{
  type: 'DigestAlreadyPublishedError';
  message: string;
  detail: { digestDate: string };
}>;

export const DigestAlreadyPublishedError = {
  create: (digestDate: string): DigestAlreadyPublishedError => ({
    type: 'DigestAlreadyPublishedError',
    message: `The digest of "${digestDate}" has already been published.`,
    detail: { digestDate },
  }),
} as const;

export type DigestDraftEditedError = Readonly<{
  type: 'DigestDraftEditedError';
  message: string;
  detail: { digestDate: string };
}>;

export const DigestDraftEditedError = {
  create: (digestDate: string): DigestDraftEditedError => ({
    type: 'DigestDraftEditedError',
    message: `The draft digest of "${digestDate}" has been edited and cannot be replaced.`,
    detail: { digestDate },
  }),
} as const;

export const Digest = {
  ...schema,
  create,
  recordPushSent,
  giveFeedback,
  expire,
  toAggregateId,
} as const;
