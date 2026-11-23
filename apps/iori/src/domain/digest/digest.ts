import type { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { XUsername } from '../feedSource/xUsername.ts';
import { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
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

const digestItemZodType = z.object({
  digestItemId: DigestItemId.zodType,
  feedEntryId: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
  rank: z.number().int().positive(),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  reasonInterestSourceId: z.string().nullable(),
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

export const SUMMARY_DIGEST_TOPIC_KEY = 'summary';

const digestDateZodType = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('DigestDate');

const digestHeaderZodType = z.object({
  digestId: DigestId.zodType,
  userId: UserId.zodType,
  digestDate: digestDateZodType,
  postId: PostId.zodType,
  xPostsPostId: z.nullable(PostId.zodType),
  createdAt: Instant.zodType,
  trigger: digestTriggerZodType,
  topicKey: z.string().min(1),
});
export type DigestHeader = z.output<typeof digestHeaderZodType>;

const zodType = digestHeaderZodType
  .extend({
    items: z.array(digestItemZodType),
    trends: z.array(digestTrendZodType),
    xPostFeedEntryIds: z.array(z.string().min(1)),
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
export type DigestExpired = DigestEvent<
  undefined,
  'digest.expired',
  { digestId: DigestId; digestDate: string }
>;
export type DigestXPostsRemoved = DigestEvent<
  Digest,
  'digest.xPostsRemoved',
  { digestId: DigestId }
>;

export type CreateDigestPayload = Readonly<{
  userId: UserId;
  digestDate: string;
  postId: PostId;
  xPostsPostId: PostId | null;
  trigger: DigestTrigger;
  topicKey: string;
  items: ReadonlyArray<Omit<DigestItem, 'digestItemId'>>;
  trends: ReadonlyArray<DigestTrend>;
  xPostFeedEntryIds: ReadonlyArray<string>;
}>;

const create = (payload: CreateDigestPayload, now: Instant): Result<DigestCreated, DigestParseError> => {
  const parsed = schema.parse({
    ...payload,
    digestId: DigestId.generate(),
    createdAt: now,
    items: payload.items.map((item) => ({ ...item, digestItemId: DigestItemId.generate() })),
  });
  if (!parsed.ok) return parsed;
  const digest = parsed.val;
  return {
    ...parsed,
    val: DigestEvent.create(toAggregateId(digest), digest, 'digest.created', digest, now),
  };
};

const expire = (header: Pick<DigestHeader, 'digestId' | 'digestDate'>, now: Instant): DigestExpired =>
  DigestEvent.create(
    toAggregateId(header),
    undefined,
    'digest.expired',
    { digestId: header.digestId, digestDate: header.digestDate },
    now,
  );

const removeXPosts = (digest: Digest, now: Instant): DigestXPostsRemoved => {
  const removed: Digest = { ...digest, xPostsPostId: null };
  return DigestEvent.create(
    toAggregateId(removed),
    removed,
    'digest.xPostsRemoved',
    { digestId: removed.digestId },
    now,
  );
};

export type DigestCreatedStore = Agg.Store<DigestCreated>;
export type DigestExpiredStore = Agg.Store<DigestExpired>;
export type DigestXPostsRemovedStore = Agg.Store<DigestXPostsRemoved>;
export type DigestHeadersResolverByUserIdAndDigestDate = Agg.Resolver<
  { userId: UserId; digestDate: string },
  ReadonlyArray<DigestHeader>
>;
export type DigestTopicItem = Readonly<{
  digestDate: string;
  topicKey: string;
  rank: number;
  title: string;
  url: string;
  embedding: Float32Array | null;
}>;
export type DigestTopicItemsResolverByUserIdAndDigestDateFrom = Agg.Resolver<
  { userId: UserId; digestDateFrom: string; limit: number },
  ReadonlyArray<DigestTopicItem>
>;
export type DigestXPost = Readonly<{ username: XUsername; title: string; url: string }>;
export type DigestItemUrlsResolverByUserId = Agg.Resolver<
  { userId: UserId; excludingDigestIds: ReadonlyArray<DigestId> },
  ReadonlyArray<string>
>;
export type LatestDigestHeaderResolverByUserId = Agg.Resolver<
  { userId: UserId; digestDateBefore: string },
  DigestHeader | undefined
>;
export type DigestHeadersResolverByDigestDateBefore = Agg.Resolver<
  { digestDateBefore: string; limit: number },
  ReadonlyArray<DigestHeader>
>;
export type DigestsResolverByXPostsCreatedBefore = Agg.Resolver<
  { createdBefore: Instant },
  ReadonlyArray<Digest>
>;

export type DigestDmSender = Readonly<{
  sendSummary: (input: Readonly<{ ownerUserId: UserId; html: string }>) => Promise<Result<PostId, string>>;
  sendReply: (
    input: Readonly<{ ownerUserId: UserId; parentPostId: PostId; html: string }>,
  ) => Promise<Result<PostId, string>>;
}>;

export type DigestTopicsUnavailableError = Readonly<{
  type: 'DigestTopicsUnavailableError';
  message: string;
}>;

export const DigestTopicsUnavailableError = {
  create: (): DigestTopicsUnavailableError => ({
    type: 'DigestTopicsUnavailableError',
    message: 'No enabled digest topic has an embedding yet.',
  }),
} as const;

export const Digest = {
  ...schema,
  create,
  expire,
  removeXPosts,
  toAggregateId,
} as const;
