import { RA } from '@iwasa-kosui/result';

import { htmlToPlainText } from '../adaptor/text/htmlToPlainText.ts';
import type { WebPushSender } from '../adaptor/webPush/webPush.ts';
import type { ArticleId } from '../domain/article/articleId.ts';
import {
  Digest,
  type DigestCreatedStore,
  type DigestHeaderResolverByUserIdAndDigestDate,
  type DigestParseError,
  type DigestPushSentStore,
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
const SUMMARY_TIMEOUT_MS = 30_000;
const SUMMARY_INPUT_MAX_CHARS = 1000;
const NEW_ENTRIES_LIMIT = 10;
const TRENDS_LIMIT = 10;
const RADAR_LIMIT = 1;
const HOUR_MS = 60 * 60 * 1000;
const MATERIAL_WINDOW_MS = 24 * HOUR_MS;

type Input = Readonly<{ userId: UserId }>;

type Ok = Readonly<{
  status: 'created' | 'skipped';
  digestId?: DigestId;
  articleId?: ArticleId;
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

type Err = UserNotFoundError | DigestParseError | DigestStoreFailedError;

export type CreateDailyDigestUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  digestSubscriptionResolverByUserId: DigestSubscriptionResolverByUserId;
  digestHeaderResolverByUserIdAndDigestDate: DigestHeaderResolverByUserIdAndDigestDate;
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

const skipped: Ok = { status: 'skipped', items: 0, trends: 0, summarized: 0, pushed: 0 };

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
  const summarize = async (entry: FeedEntry): Promise<string | null> => {
    if (textGenerator === undefined) return null;
    const generated = await Promise.race([
      textGenerator.generate({
        model: DIGEST_SUMMARY_MODEL,
        instruction: SUMMARY_INSTRUCTION,
        input: toSummaryInput(entry),
        maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      }),
      sleep(SUMMARY_TIMEOUT_MS).then(() => 'timedOut' as const),
    ]);
    if (generated === 'timedOut') {
      console.error('iori digest: summarizing an entry timed out.', {
        feedEntryId: entry.feedEntryId,
        timeoutMs: SUMMARY_TIMEOUT_MS,
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

  const run = async ({ userId }: Input) => {
    const startedAt = now();
    const digestDate = Instant.toJstDate(startedAt);

    const existing = await digestHeaderResolverByUserIdAndDigestDate.resolve({ userId, digestDate });
    if (existing.val !== undefined) return RA.ok(skipped);

    const subscription = await digestSubscriptionResolverByUserId.resolve(userId);
    if (subscription.val !== undefined && !subscription.val.enabled) return RA.ok(skipped);

    const [radarEntries, newEntries, hatenaTrends, timelineTrends] = await Promise.all([
      radarFeedEntriesResolverByFetchedSince.resolve({
        fetchedSince: Instant.addDuration(startedAt, -MATERIAL_WINDOW_MS),
        limit: RADAR_LIMIT,
      }),
      newFeedEntriesResolverByFetchedSince.resolve({
        fetchedSince: Instant.addDuration(startedAt, -MATERIAL_WINDOW_MS),
        limit: NEW_ENTRIES_LIMIT,
      }),
      hatenaTrendsResolverByFetchedSince.resolve({
        fetchedSince: Instant.addDuration(startedAt, -MATERIAL_WINDOW_MS),
        limit: TRENDS_LIMIT,
      }),
      timelineLinkTrendsResolverByUserId.resolve({
        userId,
        createdSince: Instant.addDuration(startedAt, -MATERIAL_WINDOW_MS),
        limit: TRENDS_LIMIT,
      }),
    ]);
    const radar = radarEntries.val[0];

    const summaries = await Promise.all(newEntries.val.map(summarize));
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
    if (!created.ok) return created;
    try {
      await digestCreatedStore.store(created.val);
    } catch (error) {
      const storeFailed = DigestStoreFailedError.create(articleId, error);
      console.error('iori digest: storing the digest failed after the article was created.', {
        articleId,
        message: storeFailed.message,
      });
      return RA.err(storeFailed);
    }
    const digest = created.val.aggregateState;

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

    return RA.ok<Ok>({
      status: 'created',
      digestId: digest.digestId,
      articleId,
      items: digest.items.length,
      trends: digest.trends.length,
      summarized,
      pushed,
    });
  };

  return { run };
};

export const CreateDailyDigestUseCase = {
  create,
} as const;
