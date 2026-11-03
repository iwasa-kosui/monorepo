import { RA } from '@iwasa-kosui/result';

import { htmlToPlainText } from '../adaptor/text/htmlToPlainText.ts';
import type { WebPushSender } from '../adaptor/webPush/webPush.ts';
import {
  Article,
  ArticleNotFoundError,
  type ArticleResolver,
  type ArticleWithDependentsDeletedStore,
  type DraftArticleWithDependentsDeletedStore,
} from '../domain/article/article.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import { ArticleBody, type ArticleBodyResolver } from '../domain/articleBody/articleBody.ts';
import {
  Digest,
  DigestAlreadyPublishedError,
  type DigestCreatedStore,
  type DigestHeader,
  type DigestHeaderResolverByUserIdAndDigestDate,
  type DigestParseError,
  type DigestPushSentStore,
  type DigestTrigger,
  type LatestDigestHeaderResolverByUserId,
} from '../domain/digest/digest.ts';
import { buildDigestBodies } from '../domain/digest/digestBody.ts';
import type { DigestId } from '../domain/digest/digestId.ts';
import type {
  HatenaTrendsResolverByFetchedSince,
  NewFeedEntriesResolverByFetchedSince,
  RadarFeedEntriesResolverByFetchedSince,
  TimelineLinkTrendsResolverByUserId,
} from '../domain/digest/digestMaterial.ts';
import type { DigestSubscriptionResolverByUserId } from '../domain/digestSubscription/digestSubscription.ts';
import type { FeedEntry } from '../domain/feedEntry/feedEntry.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PushSubscriptionsResolverByUserId } from '../domain/pushSubscription/pushSubscription.ts';
import type { UserNotFoundError } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { TextGenerator } from '../ports/textGenerator.ts';
import type { CreateArticleWithBodyUseCase } from './createArticleWithBody.ts';
import type { UseCase } from './useCase.ts';

export const DIGEST_SUMMARY_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

const SUMMARY_INSTRUCTION = '日本語で3行以内に要約する。英語の記事も日本語で書く。前置きを書かない。';
const SUMMARY_MAX_OUTPUT_TOKENS = 512;
const SUMMARY_TIMEOUT_MS: Readonly<Record<DigestTrigger, number>> = { scheduled: 30_000, requested: 20_000 };
const SUMMARY_INPUT_MAX_CHARS = 1000;
const NEW_ENTRIES_LIMIT = 10;
export const TRENDS_LIMIT = 10;
const RADAR_LIMIT = 1;
const HOUR_MS = 60 * 60 * 1000;
export const MATERIAL_WINDOW_MS = 24 * HOUR_MS;

type Input = Readonly<{ userId: UserId; trigger: DigestTrigger }>;

type Ok = Readonly<{
  status: 'created' | 'skipped';
  trigger: DigestTrigger;
  digestDate: string;
  digestId?: DigestId;
  articleId?: ArticleId;
  replaced: boolean;
  durationMs: number;
  items: number;
  trends: number;
  summarized: number;
  pushed: number;
}>;

type DigestStoreFailedError = Readonly<{
  type: 'DigestStoreFailedError';
  message: string;
  detail: { articleId: ArticleId };
}>;

const DigestStoreFailedError = {
  create: (articleId: ArticleId, cause: unknown): DigestStoreFailedError => ({
    type: 'DigestStoreFailedError',
    message: `Storing the digest failed after the article "${articleId}" was created: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    detail: { articleId },
  }),
} as const;

type Err =
  | UserNotFoundError
  | DigestParseError
  | DigestStoreFailedError
  | DigestAlreadyPublishedError
  | ArticleNotFoundError;

export type CreateDailyDigestUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  digestSubscriptionResolverByUserId: DigestSubscriptionResolverByUserId;
  digestHeaderResolverByUserIdAndDigestDate: DigestHeaderResolverByUserIdAndDigestDate;
  latestDigestHeaderResolverByUserId: LatestDigestHeaderResolverByUserId;
  articleResolver: ArticleResolver;
  articleBodyResolver: ArticleBodyResolver;
  articleWithDependentsDeletedStore: ArticleWithDependentsDeletedStore;
  draftArticleWithDependentsDeletedStore: DraftArticleWithDependentsDeletedStore;
  radarFeedEntriesResolverByFetchedSince: RadarFeedEntriesResolverByFetchedSince;
  newFeedEntriesResolverByFetchedSince: NewFeedEntriesResolverByFetchedSince;
  hatenaTrendsResolverByFetchedSince: HatenaTrendsResolverByFetchedSince;
  timelineLinkTrendsResolverByUserId: TimelineLinkTrendsResolverByUserId;
  textGenerator: TextGenerator | undefined;
  createArticleWithBodyUseCase: CreateArticleWithBodyUseCase;
  digestCreatedStore: DigestCreatedStore;
  digestPushSentStore: DigestPushSentStore;
  pushSubscriptionsResolverByUserId: PushSubscriptionsResolverByUserId;
  webPushSender: WebPushSender;
  now: () => Instant;
  sleep: (ms: number) => Promise<void>;
}>;

export const stripThinkBlocks = (output: string): string => {
  const lastThinkClose = [...output.matchAll(/<\/think>/gi)].at(-1);
  const answer = lastThinkClose === undefined ? output : output.slice(lastThinkClose.index + lastThinkClose[0].length);
  return answer.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
};

const toSummaryInput = (entry: FeedEntry): string =>
  Array.from(
    `${htmlToPlainText(entry.title, SUMMARY_INPUT_MAX_CHARS)}\n\n${
      htmlToPlainText(entry.description, SUMMARY_INPUT_MAX_CHARS)
    }`.trim(),
  )
    .slice(0, SUMMARY_INPUT_MAX_CHARS)
    .join('');

const create = ({
  digestSubscriptionResolverByUserId,
  digestHeaderResolverByUserIdAndDigestDate,
  latestDigestHeaderResolverByUserId,
  articleResolver,
  articleBodyResolver,
  articleWithDependentsDeletedStore,
  draftArticleWithDependentsDeletedStore,
  radarFeedEntriesResolverByFetchedSince,
  newFeedEntriesResolverByFetchedSince,
  hatenaTrendsResolverByFetchedSince,
  timelineLinkTrendsResolverByUserId,
  textGenerator,
  createArticleWithBodyUseCase,
  digestCreatedStore,
  digestPushSentStore,
  pushSubscriptionsResolverByUserId,
  webPushSender,
  now,
  sleep,
}: Deps): CreateDailyDigestUseCase => {
  const summarize = async (entry: FeedEntry, timeoutMs: number): Promise<string | null> => {
    if (textGenerator === undefined) return null;
    const generated = await Promise.race([
      textGenerator.generate({
        model: DIGEST_SUMMARY_MODEL,
        instruction: SUMMARY_INSTRUCTION,
        input: toSummaryInput(entry),
        maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      }),
      sleep(timeoutMs).then(() => 'timedOut' as const),
    ]);
    if (generated === 'timedOut') {
      console.error('iori digest: summarizing an entry timed out.', {
        feedEntryId: entry.feedEntryId,
        timeoutMs,
      });
      return null;
    }
    if (!generated.ok) {
      console.error('iori digest: summarizing an entry failed.', {
        feedEntryId: entry.feedEntryId,
        message: generated.err.message,
      });
      return null;
    }
    const summary = stripThinkBlocks(generated.val);
    return summary === '' ? null : summary;
  };

  const deleteDraftArticle = async (articleId: ArticleId): Promise<void> => {
    const deletedAt = now();
    try {
      await articleWithDependentsDeletedStore.store(
        Article.deleteArticle(deletedAt)(articleId),
        ArticleBody.deleteArticleBody(deletedAt)(articleId),
        undefined,
      );
    } catch (error) {
      console.error('iori digest: deleting the article left by the failed digest failed.', {
        articleId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const run = async ({ userId, trigger }: Input) => {
    const startedAt = now();
    const digestDate = Instant.toJstDate(startedAt);
    const skipped = (): Ok => ({
      status: 'skipped',
      trigger,
      digestDate,
      replaced: false,
      durationMs: now() - startedAt,
      items: 0,
      trends: 0,
      summarized: 0,
      pushed: 0,
    });

    const notReplaceable = () =>
      trigger === 'scheduled' ? RA.ok(skipped()) : RA.err(DigestAlreadyPublishedError.create(digestDate));

    const existing = await digestHeaderResolverByUserIdAndDigestDate.resolve({ userId, digestDate });
    let replacing: DigestHeader | undefined;
    if (existing.val !== undefined) {
      const existingArticle = await articleResolver.resolve(existing.val.articleId);
      const isDraft = existingArticle.val?.status === 'draft';
      if (trigger === 'scheduled') {
        if (existing.val.trigger !== 'requested' || !isDraft) return RA.ok(skipped());
      } else if (existingArticle.val === undefined) {
        return RA.err(ArticleNotFoundError.create(existing.val.articleId));
      } else if (!isDraft) {
        return RA.err(DigestAlreadyPublishedError.create(digestDate));
      }
      replacing = existing.val;
    }

    if (trigger === 'scheduled') {
      const subscription = await digestSubscriptionResolverByUserId.resolve(userId);
      if (subscription.val !== undefined && !subscription.val.enabled) return RA.ok(skipped());
    }

    const previous = await latestDigestHeaderResolverByUserId.resolve({
      userId,
      excludingDigestId: replacing?.digestId,
    });
    const windowStart = Instant.addDuration(startedAt, -MATERIAL_WINDOW_MS);
    const since = previous.val === undefined || previous.val.createdAt < windowStart
      ? windowStart
      : previous.val.createdAt;

    const [radarEntries, newEntries, hatenaTrends, timelineTrends] = await Promise.all([
      radarFeedEntriesResolverByFetchedSince.resolve({ fetchedSince: since, limit: RADAR_LIMIT }),
      newFeedEntriesResolverByFetchedSince.resolve({ fetchedSince: since, limit: NEW_ENTRIES_LIMIT }),
      hatenaTrendsResolverByFetchedSince.resolve({ fetchedSince: since, limit: TRENDS_LIMIT }),
      timelineLinkTrendsResolverByUserId.resolve({ userId, createdSince: since, limit: TRENDS_LIMIT }),
    ]);
    const radar = radarEntries.val[0];

    const summaries = await Promise.all(newEntries.val.map((entry) => summarize(entry, SUMMARY_TIMEOUT_MS[trigger])));
    const summarized = summaries.filter((summary) => summary !== null).length;

    const bodies = buildDigestBodies({
      radar,
      entries: newEntries.val.map((entry, index) => ({
        title: entry.title,
        url: entry.url,
        summary: summaries[index] ?? null,
        hatenaBookmarkCount: entry.hatenaBookmarkCount,
      })),
      timelineTrends: timelineTrends.val,
      hatenaTrends: hatenaTrends.val,
    });

    if (replacing !== undefined) {
      const replacedAt = now();
      const replacingArticle = await articleResolver.resolve(replacing.articleId);
      if (replacingArticle.val?.status !== 'draft') return notReplaceable();
      const body = await articleBodyResolver.resolve(replacing.articleId);
      const deleted = await draftArticleWithDependentsDeletedStore.store(
        Article.deleteArticle(replacedAt)(replacing.articleId),
        body.val === undefined ? undefined : ArticleBody.deleteArticleBody(replacedAt)(replacing.articleId),
        Digest.expire(replacing, replacedAt),
      );
      if (!deleted.val.deleted) return notReplaceable();
    }

    const article = await createArticleWithBodyUseCase.run({
      userId,
      title: `技術ニュースのダイジェスト ${digestDate}`,
      ...bodies,
    });
    if (!article.ok) return article;
    const { articleId } = article.val.article;

    const created = Digest.create({
      userId,
      digestDate,
      articleId,
      trigger,
      items: newEntries.val.map((entry, index) => ({
        feedEntryId: entry.feedEntryId,
        url: entry.url,
        title: entry.title,
        rank: index + 1,
        score: null,
        summary: summaries[index] ?? null,
        reasonInterestSourceId: null,
        feedback: null,
      })),
      trends: [
        ...hatenaTrends.val.map((trend, index) => ({ kind: 'hatena' as const, rank: index + 1, ...trend })),
        ...timelineTrends.val.map((trend, index) => ({ kind: 'timeline_link' as const, rank: index + 1, ...trend })),
      ],
    }, now());
    if (!created.ok) {
      await deleteDraftArticle(articleId);
      return created;
    }
    try {
      await digestCreatedStore.store(created.val);
    } catch (error) {
      const storeFailed = DigestStoreFailedError.create(articleId, error);
      console.error('iori digest: storing the digest failed after the article was created.', {
        articleId,
        message: storeFailed.message,
      });
      await deleteDraftArticle(articleId);
      return RA.err(storeFailed);
    }
    const digest = created.val.aggregateState;
    const durationMs = now() - startedAt;

    const createdOk = (pushed: number) =>
      RA.ok<Ok>({
        status: 'created',
        trigger,
        digestDate,
        digestId: digest.digestId,
        articleId,
        replaced: replacing !== undefined,
        durationMs,
        items: digest.items.length,
        trends: digest.trends.length,
        summarized,
        pushed,
      });
    if (trigger === 'requested') return createdOk(0);

    const pushSubscriptions = await pushSubscriptionsResolverByUserId.resolve(userId);
    const payload = {
      title: '今日のダイジェスト',
      body: `${radar === undefined ? '' : 'Radar の新しい版と'}新着 ${newEntries.val.length} 件`,
      url: `/articles/${articleId}`,
    };
    const sent = await Promise.all(pushSubscriptions.val.map(async (pushSubscription) => {
      const result = await webPushSender.send(pushSubscription, payload);
      if (!result.ok) {
        console.error('iori digest: sending a web push failed.', {
          subscriptionId: pushSubscription.subscriptionId,
          message: result.err.message,
          statusCode: result.err.statusCode,
        });
      }
      return result.ok;
    }));
    const pushed = sent.filter(Boolean).length;
    if (pushed > 0 || pushSubscriptions.val.length === 0) {
      await digestPushSentStore.store(Digest.recordPushSent(digest, now()));
    }

    return createdOk(pushed);
  };

  return { run };
};

export const CreateDailyDigestUseCase = {
  create,
} as const;
