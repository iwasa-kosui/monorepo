import { RA } from '@iwasa-kosui/result';

import type { DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../domain/digest/digest.ts';
import type { DigestTopicsResolverByUserId, StoredDigestTopic } from '../domain/digestTopic/digestTopic.ts';
import { TopicAssignmentPolicy } from '../domain/digestTopic/topicAssignment.ts';
import {
  type CandidatePreview,
  type DigestItemPreview,
  previewCandidates,
  previewDigestItems,
} from '../domain/digestTopic/topicPreview.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { RecommendableArticlesResolverByFetchedSince } from '../domain/recommendation/recommendation.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const MAX_PREVIEW_CANDIDATES = 3000;
export const MAX_PREVIEW_DIGEST_ITEMS = 600;

type Input = Readonly<{ userId: UserId; candidateHours: number; digestDays: number; limit: number }>;

type Ok = Readonly<{
  topics: ReadonlyArray<StoredDigestTopic>;
  thresholds: TopicAssignmentPolicy;
  candidates: CandidatePreview & Readonly<{ truncated: boolean }>;
  digestItems: ReadonlyArray<DigestItemPreview>;
  digestItemsTruncated: boolean;
}>;

export type PreviewDigestTopicsUseCase = UseCase<Input, Ok, never>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  recommendableArticlesResolverByFetchedSince: RecommendableArticlesResolverByFetchedSince;
  digestTopicItemsResolverByUserIdAndDigestDateFrom: DigestTopicItemsResolverByUserIdAndDigestDateFrom;
  maxCandidates?: number;
  maxDigestItems?: number;
  topicAssignmentPolicy?: TopicAssignmentPolicy;
  now: () => Instant;
}>;

const create = ({
  digestTopicsResolverByUserId,
  recommendableArticlesResolverByFetchedSince,
  digestTopicItemsResolverByUserIdAndDigestDateFrom,
  maxCandidates = MAX_PREVIEW_CANDIDATES,
  maxDigestItems = MAX_PREVIEW_DIGEST_ITEMS,
  topicAssignmentPolicy = TopicAssignmentPolicy.default,
  now,
}: Deps): PreviewDigestTopicsUseCase => {
  const run = async ({ userId, candidateHours, digestDays, limit }: Input) => {
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
    return RA.ok({
      topics: topics.val,
      thresholds: {
        minSimilarity: topicAssignmentPolicy.minSimilarity,
        minMargin: topicAssignmentPolicy.minMargin,
      },
      candidates: {
        ...previewCandidates({
          articles: articles.val.slice(0, maxCandidates),
          topics: comparableTopics,
          limit,
          policy: topicAssignmentPolicy,
        }),
        truncated: articles.val.length > maxCandidates,
      },
      digestItems: previewDigestItems({
        items: items.val.slice(0, maxDigestItems),
        comparableTopics,
        embeddedTopics,
        policy: topicAssignmentPolicy,
      }),
      digestItemsTruncated: items.val.length > maxDigestItems,
    });
  };

  return { run };
};

export const PreviewDigestTopicsUseCase = { create } as const;
