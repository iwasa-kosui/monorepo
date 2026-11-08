import { RA } from '@iwasa-kosui/result';

import type { DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../domain/digest/digest.ts';
import type { DigestTopicsResolverByUserId, StoredDigestTopic } from '../domain/digestTopic/digestTopic.ts';
import { TopicAssignmentPolicy } from '../domain/digestTopic/topicAssignment.ts';
import {
  type CandidatePreview,
  type DigestItemPreview,
  type PreviewCandidate,
  previewCandidates,
  previewDigestItems,
} from '../domain/digestTopic/topicPreview.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { RecommendableArticlesResolverByFetchedSince } from '../domain/recommendation/recommendation.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { TopicRelevanceJudge } from '../ports/topicRelevanceJudge.ts';
import type { UseCase } from './useCase.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const MAX_PREVIEW_CANDIDATES = 3000;
export const MAX_PREVIEW_DIGEST_ITEMS = 600;
export const JEV_MODEL = 'typesafe/jev';
export const JEV_CANDIDATES_PER_TOPIC = 5;
export const JEV_TIMEOUT_MS = 20_000;
const JEV_EXCERPT_MAX_CHARS = 500;

type Input = Readonly<
  { userId: UserId; candidateHours: number; digestDays: number; limit: number; withJev?: boolean }
>;

type JevPreview = Readonly<{ model: string; configured: boolean; perTopicLimit: number }>;

type Ok = Readonly<{
  topics: ReadonlyArray<StoredDigestTopic>;
  thresholds: TopicAssignmentPolicy;
  candidates: CandidatePreview & Readonly<{ truncated: boolean }>;
  digestItems: ReadonlyArray<DigestItemPreview>;
  digestItemsTruncated: boolean;
  jev: JevPreview | null;
}>;

export type PreviewDigestTopicsUseCase = UseCase<Input, Ok, never>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  recommendableArticlesResolverByFetchedSince: RecommendableArticlesResolverByFetchedSince;
  digestTopicItemsResolverByUserIdAndDigestDateFrom: DigestTopicItemsResolverByUserIdAndDigestDateFrom;
  maxCandidates?: number;
  maxDigestItems?: number;
  topicAssignmentPolicy?: TopicAssignmentPolicy;
  topicRelevanceJudge?: TopicRelevanceJudge;
  sleep?: (ms: number) => Promise<void>;
  now: () => Instant;
}>;

const create = ({
  digestTopicsResolverByUserId,
  recommendableArticlesResolverByFetchedSince,
  digestTopicItemsResolverByUserIdAndDigestDateFrom,
  maxCandidates = MAX_PREVIEW_CANDIDATES,
  maxDigestItems = MAX_PREVIEW_DIGEST_ITEMS,
  topicAssignmentPolicy = TopicAssignmentPolicy.default,
  topicRelevanceJudge,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now,
}: Deps): PreviewDigestTopicsUseCase => {
  const judgeCandidate = async (
    topic: StoredDigestTopic,
    candidate: PreviewCandidate,
    description: string,
  ): Promise<number | null> => {
    if (topicRelevanceJudge === undefined) return null;
    const judged = await Promise.race([
      topicRelevanceJudge.judge({
        model: JEV_MODEL,
        topic: { name: topic.name, description: topic.description },
        article: { title: candidate.title, excerpt: description.slice(0, JEV_EXCERPT_MAX_CHARS) },
      }),
      sleep(JEV_TIMEOUT_MS).then(() => 'timedOut' as const),
    ]);
    if (judged === 'timedOut') {
      console.error('iori digest preview: judging a candidate with Jev timed out.', {
        feedEntryId: candidate.feedEntryId,
        timeoutMs: JEV_TIMEOUT_MS,
      });
      return null;
    }
    if (!judged.ok) {
      console.error('iori digest preview: judging a candidate with Jev failed.', {
        feedEntryId: candidate.feedEntryId,
        errorMessage: judged.err.message,
      });
      return null;
    }
    return judged.val.noul;
  };

  const judgeTopCandidates = async (
    preview: CandidatePreview,
    topics: ReadonlyArray<StoredDigestTopic>,
    descriptions: ReadonlyMap<string, string>,
  ): Promise<CandidatePreview> => ({
    ...preview,
    byTopic: await Promise.all(preview.byTopic.map(async (entry) => {
      const topic = topics.find((candidate) => candidate.topicKey === entry.topicKey);
      const top = await Promise.all(entry.top.map(async (candidate, index) => {
        if (topic === undefined || index >= JEV_CANDIDATES_PER_TOPIC) return candidate;
        const jevNoul = await judgeCandidate(topic, candidate, descriptions.get(candidate.feedEntryId) ?? '');
        return { ...candidate, jevNoul };
      }));
      return { ...entry, top };
    })),
  });

  const run = async ({ userId, candidateHours, digestDays, limit, withJev = false }: Input) => {
    const startedAt = now();
    const [topics, articles, items] = await Promise.all([
      digestTopicsResolverByUserId.resolve(userId),
      recommendableArticlesResolverByFetchedSince.resolve({
        fetchedSince: Instant.addDuration(startedAt, -candidateHours * HOUR_MS),
        limit: maxCandidates + 1,
      }),
      digestTopicItemsResolverByUserIdAndDigestDateFrom.resolve({
        userId,
        digestDateFrom: Instant.toJstDate(Instant.addDuration(startedAt, -(digestDays - 1) * DAY_MS)),
        limit: maxDigestItems + 1,
      }),
    ]);
    const embeddedTopics = topics.val.filter((topic) => topic.embedding !== null);
    const comparableTopics = embeddedTopics.filter((topic) => topic.enabled);
    const usedArticles = articles.val.slice(0, maxCandidates);
    const previewed = previewCandidates({
      articles: usedArticles,
      topics: comparableTopics,
      limit,
      policy: topicAssignmentPolicy,
    });
    return RA.ok({
      topics: topics.val,
      thresholds: {
        minSimilarity: topicAssignmentPolicy.minSimilarity,
        minMargin: topicAssignmentPolicy.minMargin,
      },
      candidates: {
        ...(withJev
          ? await judgeTopCandidates(
            previewed,
            comparableTopics,
            new Map(usedArticles.map((article) => [article.feedEntryId, article.description])),
          )
          : previewed),
        truncated: articles.val.length > maxCandidates,
      },
      digestItems: previewDigestItems({
        items: items.val.slice(0, maxDigestItems),
        comparableTopics,
        embeddedTopics,
        policy: topicAssignmentPolicy,
      }),
      digestItemsTruncated: items.val.length > maxDigestItems,
      jev: withJev
        ? { model: JEV_MODEL, configured: topicRelevanceJudge !== undefined, perTopicLimit: JEV_CANDIDATES_PER_TOPIC }
        : null,
    });
  };

  return { run };
};

export const PreviewDigestTopicsUseCase = { create } as const;
