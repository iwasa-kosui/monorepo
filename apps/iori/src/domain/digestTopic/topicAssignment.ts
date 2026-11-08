import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { Recommendation } from '../recommendation/recommendation.ts';

const similarityRatio = z.number().min(0).max(1);

const policyZodType = z
  .object({
    minSimilarity: similarityRatio,
    minMargin: similarityRatio,
  })
  .describe('TopicAssignmentPolicy');
const policySchema = Schema.create<z.output<typeof policyZodType>, z.input<typeof policyZodType>>(policyZodType);
export type TopicAssignmentPolicy = Readonly<z.output<typeof policyZodType>>;
export const TopicAssignmentPolicy = {
  zodType: policyZodType,
  orThrow: policySchema.orThrow,
  default: { minSimilarity: 0.4, minMargin: 0 } satisfies TopicAssignmentPolicy,
} as const;

export const TOPIC_MIN_SIMILARITY = TopicAssignmentPolicy.default.minSimilarity;

export type TopicAssignmentArticle = Readonly<{ embedding: Float32Array }>;
export type TopicAssignmentTopic = Readonly<{ topicKey: string; embedding: Float32Array | null }>;

export type TopicMatch = Readonly<{ similarity: number; margin: number }>;

export type TopicAssignmentOutcome = 'assigned' | 'belowMinSimilarity' | 'belowMinMargin' | 'noComparableTopic';

export const judgeTopicAssignment = (
  best: Readonly<{ similarity: number; margin: number | null }> | null,
  policy: Pick<TopicAssignmentPolicy, 'minSimilarity' | 'minMargin'>,
): TopicAssignmentOutcome => {
  if (best === null) return 'noComparableTopic';
  if (best.similarity < policy.minSimilarity) return 'belowMinSimilarity';
  if (best.margin !== null && best.margin < policy.minMargin) return 'belowMinMargin';
  return 'assigned';
};

export type TopicAssignment<TArticle extends TopicAssignmentArticle> = Readonly<{
  byTopic: ReadonlyMap<string, ReadonlyArray<TArticle>>;
  matches: ReadonlyMap<TArticle, TopicMatch>;
  others: ReadonlyArray<TArticle>;
  otherCounts: Readonly<{
    belowMinSimilarity: number;
    belowMinMargin: number;
    noComparableTopic: number;
  }>;
}>;

export const assignTopics = <TArticle extends TopicAssignmentArticle>(
  input: Readonly<{
    articles: ReadonlyArray<TArticle>;
    topics: ReadonlyArray<TopicAssignmentTopic>;
    policy: Pick<TopicAssignmentPolicy, 'minSimilarity' | 'minMargin'>;
  }>,
): TopicAssignment<TArticle> => {
  const byTopic = new Map<string, TArticle[]>(input.topics.map((topic) => [topic.topicKey, []]));
  const matches = new Map<TArticle, TopicMatch>();
  const others: TArticle[] = [];
  const otherCounts = { belowMinSimilarity: 0, belowMinMargin: 0, noComparableTopic: 0 };
  for (const article of input.articles) {
    let bestTopicKey: string | undefined;
    let bestSimilarity = -Infinity;
    let secondSimilarity = -Infinity;
    for (const topic of input.topics) {
      if (topic.embedding === null || topic.embedding.length !== article.embedding.length) continue;
      const similarity = Recommendation.cosineSimilarity(article.embedding, topic.embedding);
      if (similarity > bestSimilarity) {
        secondSimilarity = bestSimilarity;
        bestSimilarity = similarity;
        bestTopicKey = topic.topicKey;
      } else if (similarity > secondSimilarity) {
        secondSimilarity = similarity;
      }
    }
    const margin = secondSimilarity === -Infinity ? Infinity : bestSimilarity - secondSimilarity;
    const outcome = judgeTopicAssignment(
      bestTopicKey === undefined ? null : { similarity: bestSimilarity, margin },
      input.policy,
    );
    if (outcome === 'assigned') {
      byTopic.get(bestTopicKey!)!.push(article);
      matches.set(article, { similarity: bestSimilarity, margin });
    } else {
      otherCounts[outcome] += 1;
      others.push(article);
    }
  }
  return { byTopic, matches, others, otherCounts };
};
