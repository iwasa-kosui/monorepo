import { type Context, Hono } from 'hono';
import { z } from 'zod/v4';

import type {
  HatenaTrendsResolverByFetchedSince,
  TimelineLinkTrendsResolverByUserId,
} from '../../domain/digest/digestMaterial.ts';
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
import type { ChangeDigestTopicMaterialWindowUseCase } from '../../useCase/changeDigestTopicMaterialWindow.ts';
import type { ChangeFeedSourceEnabledUseCase } from '../../useCase/changeFeedSourceEnabled.ts';
import { MATERIAL_WINDOW_MS, TRENDS_LIMIT } from '../../useCase/createDailyDigest.ts';
import type { EditDigestTopicUseCase } from '../../useCase/editDigestTopic.ts';
import type { IsDigestOwner } from '../../useCase/isDigestOwner.ts';
import type { PreviewDigestTopicsUseCase } from '../../useCase/previewDigestTopics.ts';
import type { SaveDigestSubscriptionUseCase } from '../../useCase/saveDigestSubscription.ts';
import { toIsoString } from '../mastodon/time.ts';
import { handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { bodyString, bodyTrimmedStringArray, readRequestBody, type RequestBody } from './helper/requestBody.ts';
import { requireSameOriginForCookie } from './helper/sameOrigin.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerIoriDigestRouterDeps = Readonly<{
  authn: MastodonAuthn;
  timelineLinkTrendsResolverByUserId: TimelineLinkTrendsResolverByUserId;
  hatenaTrendsResolverByFetchedSince: HatenaTrendsResolverByFetchedSince;
  digestSubscriptionResolverByUserId: DigestSubscriptionResolverByUserId;
  saveDigestSubscriptionUseCase: SaveDigestSubscriptionUseCase;
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  addDigestTopicUseCase: AddDigestTopicUseCase;
  editDigestTopicUseCase: EditDigestTopicUseCase;
  changeDigestTopicEnabledUseCase: ChangeDigestTopicEnabledUseCase;
  changeDigestTopicMaterialWindowUseCase: ChangeDigestTopicMaterialWindowUseCase;
  previewDigestTopicsUseCase: PreviewDigestTopicsUseCase;
  allFeedSourcesResolver: AllFeedSourcesResolver;
  addFeedSourceUseCase: AddFeedSourceUseCase;
  changeFeedSourceEnabledUseCase: ChangeFeedSourceEnabledUseCase;
  isDigestOwner: IsDigestOwner;
}>;

export type IoriDigestSubscriptionResponse = Readonly<{ subscription: Readonly<{ enabled: boolean }> }>;

export type IoriDigestTopicBody = Readonly<{
  topicKey: string;
  name: string;
  description: string;
  enabled: boolean;
  materialWindowHours: number | null;
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
  jev?: Readonly<{
    model: string;
    configured: boolean;
    perTopicLimit: number;
    totalLimit: number;
    overTotalLimit: boolean;
  }>;
  digestItems: ReadonlyArray<
    Readonly<{
      digestDate: string;
      topicKey: string;
      rank: number;
      title: string;
      url: string;
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
  jevNoul?: number | null;
}>;

const previewQuery = z.object({
  candidateHours: z.coerce.number().int().min(1).max(336).default(48),
  digestDays: z.coerce.number().int().min(1).max(30).default(14),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  withJev: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
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
const feedSourceNotFound = { error: 'Feed source not found' } as const;
const digestTopicNotFound = { error: 'Digest topic not found' } as const;
const readStatuses = Scope.orThrow('read:statuses');
const writeAccounts = Scope.orThrow('write:accounts');

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
  materialWindowHours: topic.materialWindowHours,
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
  ...(candidate.jevNoul === undefined ? {} : { jevNoul: candidate.jevNoul }),
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

const readEnabled = (body: RequestBody): boolean | undefined => {
  const enabled = body.enabled;
  if (typeof enabled === 'boolean') return enabled;
  if (enabled === 'true') return true;
  if (enabled === 'false') return false;
  return undefined;
};

const readMaterialWindowHours = (body: RequestBody): number | null | undefined => {
  const hours = body.materialWindowHours;
  if (hours === null) return null;
  if (typeof hours === 'number' && Number.isInteger(hours) && hours >= 24 && hours <= 336) return hours;
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
  timelineLinkTrendsResolverByUserId,
  hatenaTrendsResolverByFetchedSince,
  digestSubscriptionResolverByUserId,
  saveDigestSubscriptionUseCase,
  digestTopicsResolverByUserId,
  addDigestTopicUseCase,
  editDigestTopicUseCase,
  changeDigestTopicEnabledUseCase,
  changeDigestTopicMaterialWindowUseCase,
  previewDigestTopicsUseCase,
  allFeedSourcesResolver,
  addFeedSourceUseCase,
  changeFeedSourceEnabledUseCase,
  isDigestOwner,
}: WorkerIoriDigestRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
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
        // GET が所有者以外から x_user を隠すので、存在しない情報源と同じ 404 にして区別させない。
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
      const { topics, thresholds, candidates, digestItems, digestItemsTruncated, jev } = preview.val;
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
          ...(jev === null ? {} : { jev }),
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
        const materialWindowHours = readMaterialWindowHours(body);
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
        if (body.materialWindowHours !== undefined && materialWindowHours === undefined) {
          return c.json({ error: 'Validation failed: materialWindowHours' }, 400);
        }
        if (
          name === undefined && description === undefined && examples === undefined && excludes === undefined
          && enabled === undefined && materialWindowHours === undefined
        ) {
          return c.json({
            error:
              'Validation failed: name, description, examples, excludes, enabled or materialWindowHours is required',
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
        if (materialWindowHours !== undefined) {
          const changed = await changeDigestTopicMaterialWindowUseCase.run({ userId, topicKey, materialWindowHours });
          if (!changed.ok) return topicErrorResponse(c, changed.err);
          updated = changed.val;
        }
        return updated === undefined ? c.json(internalServerError, 500) : c.json({ topic: toTopicBody(updated) });
      },
    );
