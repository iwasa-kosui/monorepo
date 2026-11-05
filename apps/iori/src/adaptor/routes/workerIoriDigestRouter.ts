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
import { Instant } from '../../domain/instant/instant.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { MATERIAL_WINDOW_MS, TRENDS_LIMIT } from '../../useCase/createDailyDigest.ts';
import type { DeepDiveDigestItemUseCase } from '../../useCase/deepDiveDigestItem.ts';
import type { GiveDigestItemFeedbackUseCase } from '../../useCase/giveDigestItemFeedback.ts';
import type { RequestDigestUseCase } from '../../useCase/requestDigest.ts';
import type { SaveDigestSubscriptionUseCase } from '../../useCase/saveDigestSubscription.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { bodyString, readRequestBody, type RequestBody } from './helper/requestBody.ts';
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
  deepDiveDigestItemUseCase: DeepDiveDigestItemUseCase;
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

export type IoriDigestDeepDiveResponse = Readonly<{
  markdown: string;
  updatedAt: number;
  turnNumber: number;
  turnsLeft: number;
  dailyRemaining: number;
}>;

const deepDiveRequestBody = z.object({
  instruction: DigestDeepDive.instructionZodType.optional(),
  baseUpdatedAt: Instant.zodType,
});

const invalidToken = { error: 'The access token is invalid' } as const;
const digestNotFound = { error: 'Digest not found' } as const;
const digestItemNotFound = { error: 'Digest item not found' } as const;
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
  deepDiveDigestItemUseCase,
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
      async (c, next) => {
        if (c.req.header('Authorization') === undefined && !isSameOriginRequest(c.req.raw)) {
          return c.json({ error: 'Forbidden' }, 403);
        }
        await next();
      },
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
    });
