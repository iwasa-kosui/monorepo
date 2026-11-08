import type { DigestFeedback, DigestTopicItem } from '../digest/digest.ts';
import type { Instant } from '../instant/instant.ts';
import { Recommendation } from '../recommendation/recommendation.ts';

export const HISTOGRAM_BIN_COUNT = 40;
const HISTOGRAM_BINS_PER_UNIT = HISTOGRAM_BIN_COUNT / 2;
const HISTOGRAM_BOUNDARY_TOLERANCE = 1e-9;

export type PreviewTopic = Readonly<{ topicKey: string; embedding: Float32Array | null }>;

export type TopicSimilarity = Readonly<{ topicKey: string; similarity: number }>;

export type TopicRanking = Readonly<{
  first: TopicSimilarity;
  second: TopicSimilarity | null;
  margin: number | null;
}>;

export type HistogramBin = Readonly<{ from: number; to: number; count: number }>;

export type PreviewArticle = Readonly<{
  feedEntryId: string;
  title: string;
  url: string;
  fetchedAt: Instant;
  embedding: Float32Array;
}>;

export type PreviewCandidate = Readonly<{
  feedEntryId: string;
  title: string;
  url: string;
  fetchedAt: Instant;
  similarity: number;
  second: TopicSimilarity | null;
  margin: number | null;
}>;

export type PreviewTopicCandidates = Readonly<{
  topicKey: string;
  count: number;
  top: ReadonlyArray<PreviewCandidate>;
  bottom: ReadonlyArray<PreviewCandidate>;
}>;

export type CandidatePreview = Readonly<{
  total: number;
  top1Histogram: ReadonlyArray<HistogramBin>;
  byTopic: ReadonlyArray<PreviewTopicCandidates>;
}>;

export type DigestItemPreview = Readonly<{
  digestDate: string;
  topicKey: string;
  rank: number;
  title: string;
  url: string;
  feedback: DigestFeedback | null;
  first: TopicSimilarity | null;
  second: TopicSimilarity | null;
  margin: number | null;
  adoptedSimilarity: number | null;
  matchesFirst: boolean | null;
}>;

const similarityTo = (embedding: Float32Array, topic: PreviewTopic): number | null =>
  topic.embedding === null || topic.embedding.length !== embedding.length
    ? null
    : Recommendation.cosineSimilarity(embedding, topic.embedding);

export const rankTopics = (
  embedding: Float32Array,
  topics: ReadonlyArray<PreviewTopic>,
): TopicRanking | null => {
  let first: TopicSimilarity | null = null;
  let second: TopicSimilarity | null = null;
  for (const topic of topics) {
    const similarity = similarityTo(embedding, topic);
    if (similarity === null) continue;
    if (first === null || similarity > first.similarity) {
      second = first;
      first = { topicKey: topic.topicKey, similarity };
    } else if (second === null || similarity > second.similarity) {
      second = { topicKey: topic.topicKey, similarity };
    }
  }
  if (first === null) return null;
  return { first, second, margin: second === null ? null : first.similarity - second.similarity };
};

export const similarityHistogram = (similarities: ReadonlyArray<number>): ReadonlyArray<HistogramBin> => {
  const counts = new Array<number>(HISTOGRAM_BIN_COUNT).fill(0);
  for (const similarity of similarities) {
    if (!Number.isFinite(similarity)) continue;
    const index = Math.floor((similarity + 1) * HISTOGRAM_BINS_PER_UNIT + HISTOGRAM_BOUNDARY_TOLERANCE);
    counts[Math.min(HISTOGRAM_BIN_COUNT - 1, Math.max(0, index))]!++;
  }
  return counts.map((count, index) => ({
    from: (index - HISTOGRAM_BINS_PER_UNIT) / HISTOGRAM_BINS_PER_UNIT,
    to: (index + 1 - HISTOGRAM_BINS_PER_UNIT) / HISTOGRAM_BINS_PER_UNIT,
    count,
  }));
};

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const pickTopAndBottom = <T>(
  items: ReadonlyArray<T>,
  limit: number,
  similarityOf: (item: T) => number,
  keyOf: (item: T) => string,
): Readonly<{ top: ReadonlyArray<T>; bottom: ReadonlyArray<T> }> => {
  const descending = [...items].sort((a, b) => similarityOf(b) - similarityOf(a) || byKey(keyOf(a), keyOf(b)));
  const ascending = [...items].sort((a, b) => similarityOf(a) - similarityOf(b) || byKey(keyOf(a), keyOf(b)));
  return { top: descending.slice(0, limit), bottom: ascending.slice(0, limit) };
};

export const previewCandidates = (
  input: Readonly<{
    articles: ReadonlyArray<PreviewArticle>;
    topics: ReadonlyArray<PreviewTopic>;
    limit: number;
  }>,
): CandidatePreview => {
  const comparable = input.topics.filter((topic) => topic.embedding !== null);
  const grouped = new Map<string, PreviewCandidate[]>(comparable.map((topic) => [topic.topicKey, []]));
  const similarities: number[] = [];
  for (const article of input.articles) {
    const ranking = rankTopics(article.embedding, comparable);
    if (ranking === null) continue;
    similarities.push(ranking.first.similarity);
    grouped.get(ranking.first.topicKey)!.push({
      feedEntryId: article.feedEntryId,
      title: article.title,
      url: article.url,
      fetchedAt: article.fetchedAt,
      similarity: ranking.first.similarity,
      second: ranking.second,
      margin: ranking.margin,
    });
  }
  return {
    total: input.articles.length,
    top1Histogram: similarityHistogram(similarities),
    byTopic: comparable.map((topic) => {
      const candidates = grouped.get(topic.topicKey)!;
      return {
        topicKey: topic.topicKey,
        count: candidates.length,
        ...pickTopAndBottom(candidates, input.limit, (c) => c.similarity, (c) => c.feedEntryId),
      };
    }),
  };
};

export const previewDigestItems = (
  input: Readonly<{
    items: ReadonlyArray<DigestTopicItem>;
    comparableTopics: ReadonlyArray<PreviewTopic>;
    embeddedTopics: ReadonlyArray<PreviewTopic>;
  }>,
): ReadonlyArray<DigestItemPreview> =>
  input.items.map(({ embedding, ...item }) => {
    if (embedding === null) {
      return { ...item, first: null, second: null, margin: null, adoptedSimilarity: null, matchesFirst: null };
    }
    const ranking = rankTopics(embedding, input.comparableTopics);
    const adopted = input.embeddedTopics.find((topic) => topic.topicKey === item.topicKey);
    return {
      ...item,
      first: ranking?.first ?? null,
      second: ranking?.second ?? null,
      margin: ranking?.margin ?? null,
      adoptedSimilarity: adopted === undefined ? null : similarityTo(embedding, adopted),
      matchesFirst: ranking === null ? null : ranking.first.topicKey === item.topicKey,
    };
  });
