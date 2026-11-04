import type { Agg } from '../aggregate/index.ts';
import type { FeedEntryId } from '../feedEntry/feedEntryId.ts';
import type { FeedSourceId } from '../feedSource/feedSourceId.ts';
import type { Instant } from '../instant/instant.ts';
import { InterestSource, type InterestSourceKind } from '../interestSource/interestSource.ts';
import type { InterestSourceId } from '../interestSource/interestSourceId.ts';
import type { UserId } from '../user/userId.ts';

export const RECOMMENDATION_NEIGHBOR_COUNT = 20;
export const RECOMMENDATION_CONTRIBUTION_COUNT = 5;
export const RECOMMENDATION_DEFAULT_LIMIT = 10;
const SCORE_DECIMAL_FACTOR = 100;

export type InterestVector = Readonly<{
  interestSourceId: InterestSourceId;
  kind: InterestSourceKind;
  weight: number;
  occurredAt: Instant;
  embedding: Float32Array;
}>;

export type ArticleVector = Readonly<{
  feedEntryId: FeedEntryId;
  hatenaBookmarkCount: number | null;
  embedding: Float32Array;
}>;

export type ScoredArticle = Readonly<{
  feedEntryId: FeedEntryId;
  score: number;
  reasonInterestSourceId: InterestSourceId;
}>;

export type ScoreArticlesInput = Readonly<{
  materials: ReadonlyArray<InterestVector>;
  articles: ReadonlyArray<ArticleVector>;
  now: Instant;
  limit?: number;
}>;

export type StoredInterestVector = InterestVector & Readonly<{ ref: string }>;

export type RecommendableFeedSourceKind = 'rss' | 'hatena_hotentry' | 'hatena_entrylist';

export type RecommendableArticle =
  & ArticleVector
  & Readonly<{
    feedSourceId: FeedSourceId;
    sourceKind: RecommendableFeedSourceKind;
    url: string;
    title: string;
    description: string;
  }>;

export type InterestVectorsResolverByUserId = Agg.Resolver<UserId, ReadonlyArray<StoredInterestVector>>;
export type RecommendableArticlesResolverByFetchedSince = Agg.Resolver<
  { fetchedSince: Instant },
  ReadonlyArray<RecommendableArticle>
>;

const inverseNorm = (vector: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i]! * vector[i]!;
  return sum > 0 ? 1 / Math.sqrt(sum) : 0;
};

const indexOfMinimum = (values: Float64Array): number => {
  let minimum = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! < values[minimum]!) minimum = i;
  return minimum;
};

const dot = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
};

const decay = (material: InterestVector, now: Instant): number =>
  2 ** (-Math.max(0, now - material.occurredAt) / InterestSource.halfLivesMs[material.kind]);

const isNegative = (material: Pick<InterestVector, 'kind'>): boolean => material.kind === 'feedback_negative';

const sumOfLargest = (values: Float64Array, count: number): number => {
  values.sort();
  let sum = 0;
  for (let i = values.length - 1; i >= Math.max(0, values.length - count); i--) sum += values[i]!;
  return sum;
};

const roundScore = (score: number): number => Math.round(score * SCORE_DECIMAL_FACTOR);

type NeighborScore = Readonly<{ size: number; score: number; reasonIndex: number }>;

const scoreNeighbors = (
  article: ArticleVector,
  articleInverseNorm: number,
  materials: ReadonlyArray<InterestVector>,
  group: ReadonlyArray<number>,
  materialInverseNorms: Float64Array,
  materialFactors: Float64Array,
  neighborSimilarities: Float64Array,
  neighborIndexes: Int32Array,
): NeighborScore => {
  let size = 0;
  let weakest = 0;
  let reasonIndex = -1;
  let reasonSimilarity = -Infinity;
  for (const j of group) {
    const material = materials[j]!;
    if (material.embedding.length !== article.embedding.length) continue;
    const similarity = dot(article.embedding, material.embedding) * articleInverseNorm * materialInverseNorms[j]!;
    if (Number.isNaN(similarity)) continue;
    if (
      similarity > reasonSimilarity
      || (similarity === reasonSimilarity
        && material.interestSourceId < materials[reasonIndex]!.interestSourceId)
    ) {
      reasonSimilarity = similarity;
      reasonIndex = j;
    }
    if (size < RECOMMENDATION_NEIGHBOR_COUNT) {
      neighborSimilarities[size] = similarity;
      neighborIndexes[size] = j;
      size++;
      if (size === RECOMMENDATION_NEIGHBOR_COUNT) weakest = indexOfMinimum(neighborSimilarities);
    } else if (similarity > neighborSimilarities[weakest]!) {
      neighborSimilarities[weakest] = similarity;
      neighborIndexes[weakest] = j;
      weakest = indexOfMinimum(neighborSimilarities);
    }
  }
  if (size === 0) return { size, score: 0, reasonIndex };
  const contributions = new Float64Array(size);
  for (let k = 0; k < size; k++) contributions[k] = neighborSimilarities[k]! * materialFactors[neighborIndexes[k]!]!;
  return { size, score: sumOfLargest(contributions, RECOMMENDATION_CONTRIBUTION_COUNT), reasonIndex };
};

const scoreArticles = ({
  materials,
  articles,
  now,
  limit = RECOMMENDATION_DEFAULT_LIMIT,
}: ScoreArticlesInput): ReadonlyArray<ScoredArticle> => {
  if (materials.length === 0 || articles.length === 0 || limit <= 0) return [];
  const positives: number[] = [];
  const negatives: number[] = [];
  materials.forEach((material, index) => (isNegative(material) ? negatives : positives).push(index));
  if (positives.length === 0) return [];
  const materialInverseNorms = Float64Array.from(materials, (material) => inverseNorm(material.embedding));
  const materialFactors = Float64Array.from(materials, (material) => material.weight * decay(material, now));
  const neighborSimilarities = new Float64Array(RECOMMENDATION_NEIGHBOR_COUNT);
  const neighborIndexes = new Int32Array(RECOMMENDATION_NEIGHBOR_COUNT);

  const scored: Array<ScoredArticle & Readonly<{ bucket: number; bookmarks: number }>> = [];
  for (const article of articles) {
    const articleInverseNorm = inverseNorm(article.embedding);
    const positive = scoreNeighbors(
      article,
      articleInverseNorm,
      materials,
      positives,
      materialInverseNorms,
      materialFactors,
      neighborSimilarities,
      neighborIndexes,
    );
    if (positive.size === 0) continue;
    const negative = negatives.length === 0
      ? undefined
      : scoreNeighbors(
        article,
        articleInverseNorm,
        materials,
        negatives,
        materialInverseNorms,
        materialFactors,
        neighborSimilarities,
        neighborIndexes,
      );
    const score = positive.score - Math.max(0, negative?.score ?? 0);
    if (score <= 0) continue;
    scored.push({
      feedEntryId: article.feedEntryId,
      score,
      reasonInterestSourceId: materials[positive.reasonIndex]!.interestSourceId,
      bucket: roundScore(score),
      bookmarks: article.hatenaBookmarkCount ?? 0,
    });
  }
  scored.sort((a, b) =>
    b.bucket - a.bucket
    || b.bookmarks - a.bookmarks
    || (a.feedEntryId < b.feedEntryId ? -1 : a.feedEntryId > b.feedEntryId ? 1 : 0)
  );
  return scored.slice(0, limit).map(({ feedEntryId, score, reasonInterestSourceId }) => ({
    feedEntryId,
    score,
    reasonInterestSourceId,
  }));
};

export const Recommendation = {
  scoreArticles,
  isNegative,
} as const;
