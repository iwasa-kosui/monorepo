import { type Context, Hono } from 'hono';
import { z } from 'zod/v4';

import {
  type Digest,
  DigestFeedback,
  type DigestResolverByUserId,
  type DigestResolverByUserIdAndDigestDate,
  type DigestTopicEntriesResolverByUserIdAndDigestDate,
  type DigestTopicEntry,
  type DigestTrend,
} from '../../domain/digest/digest.ts';
import { DigestItemId } from '../../domain/digest/digestItemId.ts';
import type {
  HatenaTrendsResolverByFetchedSince,
  TimelineLinkTrendsResolverByUserId,
} from '../../domain/digest/digestMaterial.ts';
import { DIGEST_DEEP_DIVE_MAX_TURNS, DigestDeepDive } from '../../domain/digestDeepDive/digestDeepDive.ts';
import type {
  DigestSubscription,
  DigestSubscriptionResolverByUserId,
} from '../../domain/digestSubscription/digestSubscription.ts';
import type {
  DigestTopicNotFoundError,
  DigestTopicParseError,
  DigestTopicsResolverByUserId,
  StoredDigestTopic,
} from '../../domain/digestTopic/digestTopic.ts';
import type { TopicAssignmentOutcome } from '../../domain/digestTopic/topicAssignment.ts';
import type {
  DigestItemPreview,
  PreviewCandidate,
  PreviewTopicCandidates,
  TopicSimilarity,
} from '../../domain/digestTopic/topicPreview.ts';
import type {
  AllFeedSourcesResolver,
  FeedSource,
  FeedSourceAlreadyExistsError,
  FeedSourceNotFoundError,
  FeedSourceParseError,
} from '../../domain/feedSource/feedSource.ts';
import { FeedSourceId } from '../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { AddDigestTopicUseCase } from '../../useCase/addDigestTopic.ts';
import type { AddFeedSourceUseCase } from '../../useCase/addFeedSource.ts';
import type { ChangeDigestTopicEnabledUseCase } from '../../useCase/changeDigestTopicEnabled.ts';
import type { ChangeFeedSourceEnabledUseCase } from '../../useCase/changeFeedSourceEnabled.ts';
import { MATERIAL_WINDOW_MS, TRENDS_LIMIT } from '../../useCase/createDailyDigest.ts';
import type { DeepDiveDigestItemUseCase } from '../../useCase/deepDiveDigestItem.ts';
import type { EditDigestTopicUseCase } from '../../useCase/editDigestTopic.ts';
import type { GiveDigestItemFeedbackUseCase } from '../../useCase/giveDigestItemFeedback.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { PreviewDigestTopicsUseCase } from '../../useCase/previewDigestTopics.ts';
import type { RequestDigestUseCase } from '../../useCase/requestDigest.ts';
import type { SaveDigestSubscriptionUseCase } from '../../useCase/saveDigestSubscription.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { bodyString, bodyTrimmedStringArray, readRequestBody, type RequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import {
  getMastodonPrincipal,
  isSameOriginRequest,
  type MastodonAuthEnv,
  type MastodonAuthn,
} from './mastodonAuthn.ts';

export type WorkerIoriDigestRouterDeps = Readonly<{
  authn: MastodonAuthn;
  digestResolverByUserIdAndDigestDate: DigestResolverByUserIdAndDigestDate;
  digestResolverByUserId: DigestResolverByUserId;
  digestTopicEntriesResolverByUserIdAndDigestDate: DigestTopicEntriesResolverByUserIdAndDigestDate;
  timelineLinkTrendsResolverByUserId: TimelineLinkTrendsResolverByUserId;
  hatenaTrendsResolverByFetchedSince: HatenaTrendsResolverByFetchedSince;
  digestSubscriptionResolverByUserId: DigestSubscriptionResolverByUserId;
  saveDigestSubscriptionUseCase: SaveDigestSubscriptionUseCase;
  requestDigestUseCase: RequestDigestUseCase;
  giveDigestItemFeedbackUseCase: GiveDigestItemFeedbackUseCase;
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  addDigestTopicUseCase: AddDigestTopicUseCase;
  editDigestTopicUseCase: EditDigestTopicUseCase;
  changeDigestTopicEnabledUseCase: ChangeDigestTopicEnabledUseCase;
  previewDigestTopicsUseCase: PreviewDigestTopicsUseCase;
  deepDiveDigestItemUseCase: DeepDiveDigestItemUseCase;
  allFeedSourcesResolver: AllFeedSourcesResolver;
  addFeedSourceUseCase: AddFeedSourceUseCase;
  changeFeedSourceEnabledUseCase: ChangeFeedSourceEnabledUseCase;
  isDigestOwner: IsDigestOwner;
}>;

type DigestTrendBody = Readonly<{ rank: number; url: string; title: string; count: number }>;

export type IoriDigestResponse = Readonly<{
  digest: Readonly<{
    digestId: string;
    digestDate: string;
    articleId: string;
    topicKey: string;
    createdAt: string;
    pushSentAt: string | null;
    items: ReadonlyArray<
      Readonly<{ rank: number; url: string; title: string; summary: string | null; feedEntryId: string }>
    >;
    topics: ReadonlyArray<Readonly<{ topicKey: string; name: string; articleId: string; itemCount: number }>>;
    trends: Readonly<{
      timelineLinks: ReadonlyArray<DigestTrendBody>;
      hatena: ReadonlyArray<DigestTrendBody>;
    }>;
  }>;
}>;

export type IoriDigestSubscriptionResponse = Readonly<{ subscription: Readonly<{ enabled: boolean }> }>;

export type IoriDigestRequestResponse = Readonly<{
  digestId: string;
  articleId: string;
  digestDate: string;
  replaced: boolean;
}>;

export type IoriDigestTopicBody = Readonly<{
  topicKey: string;
  name: string;
  description: string;
  enabled: boolean;
  sortOrder: number;
  embedded: boolean;
  examples: ReadonlyArray<string>;
  excludes: ReadonlyArray<string>;
}>;

type TopicSimilarityBody = Readonly<{ topicKey: string; similarity: number }>;

export type IoriDigestTopicPreviewResponse = Readonly<{
  topics: ReadonlyArray<
    Pick<IoriDigestTopicBody, 'topicKey' | 'name' | 'description' | 'enabled' | 'embedded' | 'examples' | 'excludes'>
  >;
  thresholds: Readonly<{ minSimilarity: number; minMargin: number }>;
  candidates: Readonly<{
    truncated: boolean;
    total: number;
    top1Histogram: ReadonlyArray<Readonly<{ from: number; to: number; count: number }>>;
    byTopic: ReadonlyArray<
      Readonly<{
        topicKey: string;
        count: number;
        assignedCount: number;
        top: ReadonlyArray<IoriDigestPreviewCandidateBody>;
        bottom: ReadonlyArray<IoriDigestPreviewCandidateBody>;
      }>
    >;
  }>;
  digestItemsTruncated: boolean;
  digestItems: ReadonlyArray<
    Readonly<{
      digestDate: string;
      topicKey: string;
      rank: number;
      title: string;
      url: string;
      feedback: DigestFeedback | null;
      first: TopicSimilarityBody | null;
      second: TopicSimilarityBody | null;
      margin: number | null;
      adoptedSimilarity: number | null;
      matchesFirst: boolean | null;
      excludeSimilarity: number | null;
      assignment: TopicAssignmentOutcome;
    }>
  >;
}>;

type IoriDigestPreviewCandidateBody = Readonly<{
  feedEntryId: string;
  title: string;
  url: string;
  fetchedAt: string;
  similarity: number;
  second: TopicSimilarityBody | null;
  margin: number | null;
  excludeSimilarity: number | null;
  assignment: TopicAssignmentOutcome;
}>;

export type IoriDigestDeepDiveResponse = Readonly<{
  markdown: string;
  updatedAt: number;
  turnNumber: number;
  turnsLeft: number;
  dailyRemaining: number;
}>;

const previewQuery = z.object({
  candidateHours: z.coerce.number().int().min(1).max(72).default(48),
  digestDays: z.coerce.number().int().min(1).max(30).default(14),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const deepDiveRequestBody = z.object({
  instruction: DigestDeepDive.instructionZodType.optional(),
  baseUpdatedAt: Instant.zodType,
});

export type IoriFeedSourceBody = Readonly<{
  feedSourceId: string;
  kind: string;
  url: string;
  title: string;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
}>;

const forbidden = { error: 'Forbidden' } as const;
const invalidToken = { error: 'The access token is invalid' } as const;
const digestNotFound = { error: 'Digest not found' } as const;
const digestItemNotFound = { error: 'Digest item not found' } as const;
const feedSourceNotFound = { error: 'Feed source not found' } as const;
const digestTopicNotFound = { error: 'Digest topic not found' } as const;
const readStatuses = Scope.orThrow('read:statuses');
const writeAccounts = Scope.orThrow('write:accounts');
const writeStatuses = Scope.orThrow('write:statuses');
const digestDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const toTrendBody = ({ rank, url, title, count }: DigestTrend): DigestTrendBody => ({ rank, url, title, count });

const toDigestBody = (digest: Digest, topics: ReadonlyArray<DigestTopicEntry>): IoriDigestResponse => ({
  digest: {
    digestId: digest.digestId,
    digestDate: digest.digestDate,
    articleId: digest.articleId,
    topicKey: digest.topicKey,
    createdAt: toIsoString(digest.createdAt),
    pushSentAt: digest.pushSentAt === null ? null : toIsoString(digest.pushSentAt),
    items: digest.items.map(({ rank, url, title, summary, feedEntryId }) => ({
      rank,
      url,
      title,
      summary,
      feedEntryId,
    })),
    topics: topics.map(({ topicKey, name, articleId, itemCount }) => ({ topicKey, name, articleId, itemCount })),
    trends: {
      timelineLinks: digest.trends.filter((trend) => trend.kind === 'timeline_link').map(toTrendBody),
      hatena: digest.trends.filter((trend) => trend.kind === 'hatena').map(toTrendBody),
    },
  },
});

const toFeedSourceBody = (source: FeedSource): IoriFeedSourceBody => ({
  feedSourceId: source.feedSourceId,
  kind: source.kind,
  url: source.url,
  title: source.title,
  enabled: source.enabled,
  lastFetchedAt: source.lastFetchedAt === null ? null : toIsoString(source.lastFetchedAt),
  lastError: source.lastError,
});

const toTopicBody = (topic: StoredDigestTopic): IoriDigestTopicBody => ({
  topicKey: topic.topicKey,
  name: topic.name,
  description: topic.description,
  enabled: topic.enabled,
  sortOrder: topic.sortOrder,
  embedded: topic.embedding !== null,
  examples: topic.examples,
  excludes: topic.excludes,
});

const SIMILARITY_DECIMAL_FACTOR = 10_000;
const roundSimilarity = (value: number): number =>
  Math.round(value * SIMILARITY_DECIMAL_FACTOR) / SIMILARITY_DECIMAL_FACTOR;
const roundNullable = (value: number | null): number | null => value === null ? null : roundSimilarity(value);
const toSimilarityBody = (similarity: TopicSimilarity | null): TopicSimilarityBody | null =>
  similarity === null
    ? null
    : { topicKey: similarity.topicKey, similarity: roundSimilarity(similarity.similarity) };

const toPreviewCandidateBody = (candidate: PreviewCandidate): IoriDigestPreviewCandidateBody => ({
  feedEntryId: candidate.feedEntryId,
  title: candidate.title,
  url: candidate.url,
  fetchedAt: toIsoString(candidate.fetchedAt),
  similarity: roundSimilarity(candidate.similarity),
  second: toSimilarityBody(candidate.second),
  margin: roundNullable(candidate.margin),
  excludeSimilarity: roundNullable(candidate.excludeSimilarity),
  assignment: candidate.assignment,
});

const toPreviewTopicCandidatesBody = (entry: PreviewTopicCandidates) => ({
  topicKey: entry.topicKey,
  count: entry.count,
  assignedCount: entry.assignedCount,
  top: entry.top.map(toPreviewCandidateBody),
  bottom: entry.bottom.map(toPreviewCandidateBody),
});

const toPreviewDigestItemBody = (item: DigestItemPreview) => ({
  digestDate: item.digestDate,
  topicKey: item.topicKey,
  rank: item.rank,
  title: item.title,
  url: item.url,
  feedback: item.feedback,
  first: toSimilarityBody(item.first),
  second: toSimilarityBody(item.second),
  margin: roundNullable(item.margin),
  adoptedSimilarity: roundNullable(item.adoptedSimilarity),
  matchesFirst: item.matchesFirst,
  excludeSimilarity: roundNullable(item.excludeSimilarity),
  assignment: item.assignment,
});

const toSubscriptionBody = (subscription: Pick<DigestSubscription, 'enabled'> | undefined) =>
  ({
    subscription: { enabled: subscription?.enabled ?? true },
  }) satisfies IoriDigestSubscriptionResponse;

const keepAlive = (c: Context<MastodonAuthEnv>, promise: Promise<unknown>): void => {
  let executionCtx: Context<MastodonAuthEnv>['executionCtx'] | undefined;
  try {
    executionCtx = c.executionCtx;
  } catch {
    executionCtx = undefined;
  }
  executionCtx?.waitUntil(promise);
};

const readEnabled = (body: RequestBody): boolean | undefined => {
  const enabled = body.enabled;
  if (typeof enabled === 'boolean') return enabled;
  if (enabled === 'true') return true;
  if (enabled === 'false') return false;
  return undefined;
};

const feedSourceErrorResponse = (
  c: Context<MastodonAuthEnv>,
  err: FeedSourceAlreadyExistsError | FeedSourceNotFoundError | FeedSourceParseError,
) => {
  if (!('type' in err)) return c.json({ error: `Validation failed: ${err.message}` }, 400);
  return err.type === 'FeedSourceNotFoundError'
    ? c.json(feedSourceNotFound, 404)
    : c.json({ error: 'Feed source already exists' }, 409);
};
const topicErrorResponse = (c: Context<MastodonAuthEnv>, err: DigestTopicNotFoundError | DigestTopicParseError) =>
  'type' in err
    ? c.json(digestTopicNotFound, 404)
    : c.json({ error: `Validation failed: ${err.message}` }, 400);

const userIdOf = (c: Context<MastodonAuthEnv>): UserId | undefined => getMastodonPrincipal(c)?.userId ?? undefined;

export const createWorkerIoriDigestRouter = ({
  authn,
  digestResolverByUserIdAndDigestDate,
  digestResolverByUserId,
  digestTopicEntriesResolverByUserIdAndDigestDate,
  timelineLinkTrendsResolverByUserId,
  hatenaTrendsResolverByFetchedSince,
  digestSubscriptionResolverByUserId,
  saveDigestSubscriptionUseCase,
  requestDigestUseCase,
  giveDigestItemFeedbackUseCase,
  digestTopicsResolverByUserId,
  addDigestTopicUseCase,
  editDigestTopicUseCase,
  changeDigestTopicEnabledUseCase,
  previewDigestTopicsUseCase,
  deepDiveDigestItemUseCase,
  allFeedSourcesResolver,
  addFeedSourceUseCase,
  changeFeedSourceEnabledUseCase,
  isDigestOwner,
}: WorkerIoriDigestRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .get('/iori/v1/digests/latest', authn.requireUser(readStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const digest = await digestResolverByUserId.resolve(userId);
      if (!digest.ok) return c.json(internalServerError, 500);
      if (digest.val === undefined) return c.json(digestNotFound, 404);
      const topics = await digestTopicEntriesResolverByUserIdAndDigestDate.resolve({
        userId,
        digestDate: digest.val.digestDate,
      });
      return topics.ok ? c.json(toDigestBody(digest.val, topics.val)) : c.json(internalServerError, 500);
    })
    .get('/iori/v1/digests/:date', authn.requireUser(readStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const digestDate = c.req.param('date');
      if (!digestDatePattern.test(digestDate)) return c.json({ error: 'Validation failed: date' }, 400);
      const digest = await digestResolverByUserIdAndDigestDate.resolve({ userId, digestDate });
      if (!digest.ok) return c.json(internalServerError, 500);
      if (digest.val === undefined) return c.json(digestNotFound, 404);
      const topics = await digestTopicEntriesResolverByUserIdAndDigestDate.resolve({
        userId,
        digestDate: digest.val.digestDate,
      });
      return topics.ok ? c.json(toDigestBody(digest.val, topics.val)) : c.json(internalServerError, 500);
    })
    .get('/iori/v1/trends/links', authn.requireUser(readStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const links = await timelineLinkTrendsResolverByUserId.resolve({
        userId,
        createdSince: Instant.addDuration(Instant.now(), -MATERIAL_WINDOW_MS),
        limit: TRENDS_LIMIT,
      });
      return links.ok ? c.json({ links: links.val }) : c.json(internalServerError, 500);
    })
    .get('/iori/v1/trends/hatena', authn.requireUser(readStatuses), async (c) => {
      const entries = await hatenaTrendsResolverByFetchedSince.resolve({
        fetchedSince: Instant.addDuration(Instant.now(), -MATERIAL_WINDOW_MS),
        limit: TRENDS_LIMIT,
      });
      return entries.ok ? c.json({ entries: entries.val }) : c.json(internalServerError, 500);
    })
    .get('/iori/v1/digest/subscription', authn.requireUser(readStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const subscription = await digestSubscriptionResolverByUserId.resolve(userId);
      return subscription.ok ? c.json(toSubscriptionBody(subscription.val)) : c.json(internalServerError, 500);
    })
    .put('/iori/v1/digest/subscription', authn.requireUser(writeAccounts), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const enabled = readEnabled(await readRequestBody(c));
      if (enabled === undefined) return c.json({ error: 'Validation failed: enabled' }, 400);
      const saved = await saveDigestSubscriptionUseCase.run({ userId, enabled });
      return saved.ok ? c.json(toSubscriptionBody(saved.val)) : c.json(internalServerError, 500);
    })
    .post(
      '/iori/v1/digest-items/:digestItemId/feedback',
      requireSameOriginForCookie,
      authn.requireUser(writeAccounts),
      async (c) => {
        const userId = userIdOf(c);
        if (userId === undefined) return c.json(invalidToken, 401);
        const feedback = DigestFeedback.zodType.safeParse(bodyString(await readRequestBody(c), 'feedback'));
        if (!feedback.success) return c.json({ error: 'Validation failed: feedback' }, 400);
        const digestItemId = DigestItemId.parse(c.req.param('digestItemId'));
        if (!digestItemId.ok) return c.json(digestItemNotFound, 404);
        const given = await giveDigestItemFeedbackUseCase.run({
          userId,
          digestItemId: digestItemId.val,
          feedback: feedback.data,
        });
        if (given.ok) return c.redirect(`/articles/${given.val.articleId}`, 303);
        if (!('type' in given.err)) return c.json(internalServerError, 500);
        switch (given.err.type) {
          case 'DigestItemNotFoundError':
            return c.json(digestItemNotFound, 404);
          case 'DigestArticlePublishedError':
            return c.json({ error: 'Digest already published' }, 409);
          default:
            return c.json(internalServerError, 500);
        }
      },
    )
    .post(
      '/iori/v1/digest-items/:digestItemId/deep-dive',
      async (c, next) => {
        if (c.req.header('Authorization') === undefined && !isSameOriginRequest(c.req.raw)) {
          return c.json({ error: 'Forbidden' }, 403);
        }
        await next();
      },
      authn.requireUser(writeStatuses),
      async (c) => {
        const userId = userIdOf(c);
        if (userId === undefined) return c.json(invalidToken, 401);
        const digestItemId = DigestItemId.parse(c.req.param('digestItemId'));
        if (!digestItemId.ok) return c.json(digestItemNotFound, 404);
        const body = deepDiveRequestBody.safeParse(await readRequestBody(c));
        if (!body.success) {
          return c.json({
            error: `Validation failed: ${body.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
          }, 400);
        }
        const dived = await deepDiveDigestItemUseCase.run({
          userId,
          digestItemId: digestItemId.val,
          instruction: body.data.instruction ?? '',
          baseUpdatedAt: body.data.baseUpdatedAt,
        });
        if (dived.ok) {
          const { markdown, updatedAt, turnNumber, turnsLeft, dailyRemaining } = dived.val;
          return c.json(
            { markdown, updatedAt, turnNumber, turnsLeft, dailyRemaining } satisfies IoriDigestDeepDiveResponse,
          );
        }
        const { err } = dived;
        if (!('type' in err)) return c.json(internalServerError, 500);
        switch (err.type) {
          case 'DigestItemNotFoundError':
            return c.json(digestItemNotFound, 404);
          case 'ArticleNotFoundError':
            return c.json(digestItemNotFound, 404);
          case 'ArticleInvalidStatusError':
            return c.json({ error: 'Digest already published' }, 409);
          case 'ArticleNotEditableError':
            return c.json({ error: err.message }, 409);
          case 'DigestDeepDiveConflictError':
            return c.json({ error: err.message }, 409);
          case 'DigestDeepDiveTurnLimitError':
            return c.json({ error: `A deep dive accepts at most ${DIGEST_DEEP_DIVE_MAX_TURNS} turns` }, 409);
          case 'DigestDeepDiveLimitError':
            c.header('Retry-After', String(err.retryAfterSeconds));
            return c.json({ error: err.message }, 429);
          case 'DigestItemNotInBodyError':
            return c.json({ error: err.message }, 422);
          case 'DigestDeepDiveTimeoutError':
            return c.json({ error: err.message }, 504);
          case 'DigestDeepDiveGenerationFailedError':
            return c.json({ error: err.message }, 502);
          default:
            return c.json(internalServerError, 500);
        }
      },
    )
    .post('/iori/v1/digests', authn.requireUser(writeAccounts), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const generation = requestDigestUseCase.run({ userId });
      keepAlive(c, generation);
      const requested = await generation;
      if (requested.ok) {
        const { digestId, articleId, digestDate, replaced } = requested.val;
        return c.json({ digestId, articleId, digestDate, replaced } satisfies IoriDigestRequestResponse, 201);
      }
      const { err } = requested;
      if (!('type' in err)) return c.json(internalServerError, 500);
      switch (err.type) {
        case 'DigestAlreadyPublishedError':
          return c.json({ error: 'Digest already published' }, 409);
        case 'DigestDraftEditedError':
          return c.json({ error: 'Digest draft edited' }, 409);
        case 'DigestTopicsUnavailableError':
          return c.json({ error: 'Digest topics unavailable' }, 503);
        case 'DigestRequestLimitError':
          c.header('Retry-After', String(err.retryAfterSeconds));
          return err.reason === 'daily_limit'
            ? c.json({ error: err.message }, 429)
            : c.json({ error: 'Digest request too soon' }, 409);
        case 'ArticleNotFoundError':
          return c.json(internalServerError, 500);
        default:
          return c.json(internalServerError, 500);
      }
    })
    .get('/iori/v1/feed-sources', authn.requireUser(readStatuses), async (c) => {
      const sources = await allFeedSourcesResolver.resolve();
      if (!sources.ok) return c.json(internalServerError, 500);
      const visible = (await isDigestOwner(userIdOf(c)))
        ? sources.val
        : sources.val.filter((source) => source.kind !== 'x_user');
      return c.json({ sources: visible.map(toFeedSourceBody) });
    })
    .post('/iori/v1/feed-sources', requireSameOriginForCookie, authn.requireUser(writeAccounts), async (c) => {
      if (!(await isDigestOwner(userIdOf(c)))) return c.json(forbidden, 403);
      const body = await readRequestBody(c);
      if (bodyString(body, 'kind')?.trim() === 'x_user') {
        const username = bodyString(body, 'username')?.trim();
        if (username === undefined) return c.json({ error: 'Validation failed: username' }, 400);
        const added = await addFeedSourceUseCase.run({ kind: 'x_user', username });
        return added.ok
          ? c.json({ source: toFeedSourceBody(added.val) }, 201)
          : feedSourceErrorResponse(c, added.err);
      }
      const url = bodyString(body, 'url')?.trim();
      if (url === undefined) return c.json({ error: 'Validation failed: url' }, 400);
      const title = bodyString(body, 'title')?.trim();
      if (title === undefined) return c.json({ error: 'Validation failed: title' }, 400);
      const added = await addFeedSourceUseCase.run({ kind: 'rss', url, title });
      return added.ok ? c.json({ source: toFeedSourceBody(added.val) }, 201) : feedSourceErrorResponse(c, added.err);
    })
    .patch(
      '/iori/v1/feed-sources/:feedSourceId',
      requireSameOriginForCookie,
      authn.requireUser(writeAccounts),
      async (c) => {
        if (!(await isDigestOwner(userIdOf(c)))) return c.json(feedSourceNotFound, 404);
        const feedSourceId = FeedSourceId.parse(c.req.param('feedSourceId'));
        if (!feedSourceId.ok) return c.json(feedSourceNotFound, 404);
        const enabled = readEnabled(await readRequestBody(c));
        if (enabled === undefined) return c.json({ error: 'Validation failed: enabled' }, 400);
        const changed = await changeFeedSourceEnabledUseCase.run({ feedSourceId: feedSourceId.val, enabled });
        return changed.ok ? c.json({ source: toFeedSourceBody(changed.val) }) : feedSourceErrorResponse(c, changed.err);
      },
    )
    .get('/iori/v1/digest-topics', authn.requireUser(readStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const topics = await digestTopicsResolverByUserId.resolve(userId);
      return topics.ok ? c.json({ topics: topics.val.map(toTopicBody) }) : c.json(internalServerError, 500);
    })
    .get('/iori/v1/digest-topics/preview', authn.requireUser(readStatuses), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const query = previewQuery.safeParse(c.req.query());
      if (!query.success) {
        return c.json({
          error: `Validation failed: ${query.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
        }, 400);
      }
      const preview = await previewDigestTopicsUseCase.run({ userId, ...query.data });
      if (!preview.ok) return c.json(internalServerError, 500);
      const { topics, thresholds, candidates, digestItems, digestItemsTruncated } = preview.val;
      return c.json(
        {
          topics: topics.map(({ topicKey, name, description, enabled, embedding, examples, excludes }) => ({
            topicKey,
            name,
            description,
            enabled,
            embedded: embedding !== null,
            examples,
            excludes,
          })),
          thresholds,
          candidates: {
            truncated: candidates.truncated,
            total: candidates.total,
            top1Histogram: candidates.top1Histogram,
            byTopic: candidates.byTopic.map(toPreviewTopicCandidatesBody),
          },
          digestItemsTruncated,
          digestItems: digestItems.map(toPreviewDigestItemBody),
        } satisfies IoriDigestTopicPreviewResponse,
      );
    })
    .post('/iori/v1/digest-topics', requireSameOriginForCookie, authn.requireUser(writeAccounts), async (c) => {
      const userId = userIdOf(c);
      if (userId === undefined) return c.json(invalidToken, 401);
      const body = await readRequestBody(c);
      const name = bodyString(body, 'name')?.trim();
      if (name === undefined) return c.json({ error: 'Validation failed: name' }, 400);
      const description = bodyString(body, 'description')?.trim();
      if (description === undefined) return c.json({ error: 'Validation failed: description' }, 400);
      const examples = bodyTrimmedStringArray(body, 'examples');
      if (body.examples !== undefined && examples === undefined) {
        return c.json({ error: 'Validation failed: examples' }, 400);
      }
      const excludes = bodyTrimmedStringArray(body, 'excludes');
      if (body.excludes !== undefined && excludes === undefined) {
        return c.json({ error: 'Validation failed: excludes' }, 400);
      }
      const added = await addDigestTopicUseCase.run({ userId, name, description, examples, excludes });
      return added.ok ? c.json({ topic: toTopicBody(added.val) }, 201) : topicErrorResponse(c, added.err);
    })
    .patch(
      '/iori/v1/digest-topics/:topicKey',
      requireSameOriginForCookie,
      authn.requireUser(writeAccounts),
      async (c) => {
        const userId = userIdOf(c);
        if (userId === undefined) return c.json(invalidToken, 401);
        const topicKey = c.req.param('topicKey');
        const body = await readRequestBody(c);
        const name = bodyString(body, 'name')?.trim();
        const description = bodyString(body, 'description')?.trim();
        const examples = bodyTrimmedStringArray(body, 'examples');
        const excludes = bodyTrimmedStringArray(body, 'excludes');
        const enabled = readEnabled(body);
        if (body.name !== undefined && name === undefined) return c.json({ error: 'Validation failed: name' }, 400);
        if (body.description !== undefined && description === undefined) {
          return c.json({ error: 'Validation failed: description' }, 400);
        }
        if (body.examples !== undefined && examples === undefined) {
          return c.json({ error: 'Validation failed: examples' }, 400);
        }
        if (body.excludes !== undefined && excludes === undefined) {
          return c.json({ error: 'Validation failed: excludes' }, 400);
        }
        if (body.enabled !== undefined && enabled === undefined) {
          return c.json({ error: 'Validation failed: enabled' }, 400);
        }
        if (
          name === undefined && description === undefined && examples === undefined && excludes === undefined
          && enabled === undefined
        ) {
          return c.json({
            error: 'Validation failed: name, description, examples, excludes or enabled is required',
          }, 400);
        }
        let updated: StoredDigestTopic | undefined;
        if (name !== undefined || description !== undefined || examples !== undefined || excludes !== undefined) {
          const edited = await editDigestTopicUseCase.run({ userId, topicKey, name, description, examples, excludes });
          if (!edited.ok) return topicErrorResponse(c, edited.err);
          updated = edited.val;
        }
        if (enabled !== undefined) {
          const changed = await changeDigestTopicEnabledUseCase.run({ userId, topicKey, enabled });
          if (!changed.ok) return topicErrorResponse(c, changed.err);
          updated = changed.val;
        }
        return updated === undefined ? c.json(internalServerError, 500) : c.json({ topic: toTopicBody(updated) });
      },
    );
