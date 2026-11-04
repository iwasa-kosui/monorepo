import { Recommendation } from '../recommendation/recommendation.ts';

export const TOPIC_MIN_SIMILARITY = 0.4;

export type TopicAssignmentArticle = Readonly<{ embedding: Float32Array }>;
export type TopicAssignmentTopic = Readonly<{ topicKey: string; embedding: Float32Array | null }>;

export type TopicAssignment<TArticle extends TopicAssignmentArticle> = Readonly<{
  byTopic: ReadonlyMap<string, ReadonlyArray<TArticle>>;
  others: ReadonlyArray<TArticle>;
}>;

export const assignTopics = <TArticle extends TopicAssignmentArticle>(
  input: Readonly<{
    articles: ReadonlyArray<TArticle>;
    topics: ReadonlyArray<TopicAssignmentTopic>;
    minSimilarity: number;
  }>,
): TopicAssignment<TArticle> => {
  const byTopic = new Map<string, TArticle[]>(input.topics.map((topic) => [topic.topicKey, []]));
  const others: TArticle[] = [];
  for (const article of input.articles) {
    let bestTopicKey: string | undefined;
    let bestSimilarity = -Infinity;
    for (const topic of input.topics) {
      if (topic.embedding === null || topic.embedding.length !== article.embedding.length) continue;
      const similarity = Recommendation.cosineSimilarity(article.embedding, topic.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestTopicKey = topic.topicKey;
      }
    }
    if (bestTopicKey === undefined || bestSimilarity < input.minSimilarity) others.push(article);
    else byTopic.get(bestTopicKey)!.push(article);
  }
  return { byTopic, others };
};
