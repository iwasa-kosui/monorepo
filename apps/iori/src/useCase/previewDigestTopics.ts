import { RA } from '@iwasa-kosui/result';

import type { DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../domain/digest/digest.ts';
import type { DigestTopicsResolverByUserId, StoredDigestTopic } from '../domain/digestTopic/digestTopic.ts';
import { TOPIC_MIN_SIMILARITY } from '../domain/digestTopic/topicAssignment.ts';
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

type Input = Readonly<{ userId: UserId; candidateHours: number; digestDays: number; limit: number }>;

type Ok = Readonly<{
  topics: ReadonlyArray<StoredDigestTopic>;
  thresholds: Readonly<{ topicMinSimilarity: number }>;
  candidates: CandidatePreview;
  digestItems: ReadonlyArray<DigestItemPreview>;
}>;

export type PreviewDigestTopicsUseCase = UseCase<Input, Ok, never>;

type Deps = Readonly<{
  digestTopicsResolverByUserId: DigestTopicsResolverByUserId;
  recommendableArticlesResolverByFetchedSince: RecommendableArticlesResolverByFetchedSince;
  digestTopicItemsResolverByUserIdAndDigestDateFrom: DigestTopicItemsResolverByUserIdAndDigestDateFrom;
  now: () => Instant;
}>;

const create = ({
  digestTopicsResolverByUserId,
  recommendableArticlesResolverByFetchedSince,
  digestTopicItemsResolverByUserIdAndDigestDateFrom,
  now,
}: Deps): PreviewDigestTopicsUseCase => {
  const run = async ({ userId, candidateHours, digestDays, limit }: Input) => {
    const startedAt = now();
    const [topics, articles, items] = await Promise.all([
      digestTopicsResolverByUserId.resolve(userId),
      recommendableArticlesResolverByFetchedSince.resolve({
        fetchedSince: Instant.addDuration(startedAt, -candidateHours * HOUR_MS),
      }),
      digestTopicItemsResolverByUserIdAndDigestDateFrom.resolve({
        userId,
        digestDateFrom: Instant.toJstDate(Instant.addDuration(startedAt, -(digestDays - 1) * DAY_MS)),
      }),
    ]);
    const embeddedTopics = topics.val.filter((topic) => topic.embedding !== null);
    const comparableTopics = embeddedTopics.filter((topic) => topic.enabled);
    return RA.ok({
      topics: topics.val,
      thresholds: { topicMinSimilarity: TOPIC_MIN_SIMILARITY },
      candidates: previewCandidates({ articles: articles.val, topics: comparableTopics, limit }),
      digestItems: previewDigestItems({ items: items.val, comparableTopics, embeddedTopics }),
    });
  };

  return { run };
};

export const PreviewDigestTopicsUseCase = { create } as const;
