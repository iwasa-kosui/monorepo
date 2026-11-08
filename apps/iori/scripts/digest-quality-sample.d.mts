export const EMBEDDING_DIMENSIONS: number;
export const DIGEST_WINDOW_MS: number;
export const CANDIDATE_WINDOW_MS: number;
export const PAGE_SIZE: number;
export const TOP1_HISTOGRAM: { readonly start: number; readonly step: number; readonly count: number };
export const GAP_HISTOGRAM: { readonly start: number; readonly step: number; readonly count: number };
export const CANDIDATE_THRESHOLDS: readonly number[];
export const MATERIAL_THRESHOLDS: readonly number[];
export const MATERIAL_LOW_LIMIT: number;
export function topicsSql(): string;
export function itemsSql(now: number): string;
export function candidatesSql(now: number, cursor?: string): string;
export function materialsSql(cursor?: string): string;
export function baseStatements(now: number): string[];
export function hexToEmbedding(hex: unknown): Float32Array | null;
export function cosineSimilarity(a: Float32Array, b: Float32Array): number;
export type RankedTopic = { topicKey: string; similarity: number };
export type Ranking = { first: RankedTopic; second: RankedTopic | null; gap: number | null };
export function rankTopics(
  vector: Float32Array,
  topics: ReadonlyArray<{ topicKey: string; vector: Float32Array }>,
): Ranking | null;
export type Histogram = { start: number; step: number; below: number; buckets: number[]; atOrAbove: number };
export function histogram(
  values: readonly number[],
  options: { start: number; step: number; count: number },
): Histogram;
export type Topic = {
  topicKey: string;
  name: string;
  description: string;
  enabled: boolean;
  embedded: boolean;
  vector: Float32Array | null;
};
export type TopicsByUser = Map<string, Topic[]>;
export type ScoredItem = {
  digestDate: string;
  adoptedTopicKey: string;
  title: string;
  url: string;
  first: RankedTopic | null;
  second: RankedTopic | null;
  gap: number | null;
  matched: boolean | null;
  feedback: string | null;
};
export type ScoredCandidate = { title: string; url: string; topicKey: string; similarity: number; gap: number | null };
export type ScoredMaterial = { kind: string; ref: string; similarity: number | null };
export function parseTopics(rows: ReadonlyArray<Record<string, unknown>>): TopicsByUser;
export function scoreItems(
  rows: ReadonlyArray<Record<string, unknown>>,
  topicsByUser: TopicsByUser,
  into?: Map<string, ScoredItem[]>,
): Map<string, ScoredItem[]>;
export function scoreCandidates(
  rows: ReadonlyArray<Record<string, unknown>>,
  topicsByUser: TopicsByUser,
  into?: Map<string, ScoredCandidate[]>,
): Map<string, ScoredCandidate[]>;
export function scoreMaterials(
  rows: ReadonlyArray<Record<string, unknown>>,
  topicsByUser: TopicsByUser,
  into?: Map<string, ScoredMaterial[]>,
): Map<string, ScoredMaterial[]>;
export type DigestQualityReport = {
  generatedAt: string;
  users: Array<{
    user: number;
    userId: string;
    topicCounts: { total: number; enabled: number; embedded: number };
    topics: Array<{ topicKey: string; name: string; description: string; enabled: boolean; embedded: boolean }>;
    items: {
      total: number;
      scored: number;
      matched: number;
      top1Histogram: Histogram;
      gapHistogram: Histogram;
      details: Array<{
        digestDate: string;
        adoptedTopicKey: string;
        title: string;
        url: string;
        first: RankedTopic | null;
        second: RankedTopic | null;
        gap: number | null;
        matched: boolean | null;
        feedback: string | null;
      }>;
    };
    candidates: {
      total: number;
      atLeast: Record<string, number>;
      top1Histogram: Histogram;
      gapHistogram: Histogram;
      byTopic: Array<{
        topicKey: string;
        count: number;
        top: Array<{ title: string; url: string; similarity: number }>;
        bottom: Array<{ title: string; url: string; similarity: number }>;
      }>;
    };
    materials: {
      total: number;
      byKind: Array<{ kind: string; total: number; atLeast: Record<string, number> }>;
      low: Array<{ kind: string; ref: string; similarity: number }>;
    };
  }>;
};
export function buildReport(options: {
  now: number;
  topicsByUser: TopicsByUser;
  items: Map<string, ScoredItem[]>;
  candidates: Map<string, ScoredCandidate[]>;
  materials: Map<string, ScoredMaterial[]>;
}): DigestQualityReport;
export function noticeLines(report: DigestQualityReport): string[];
export function digestQualitySample(options: {
  env: Record<string, string | undefined>;
  signal?: AbortSignal;
  fetchRequest?: typeof fetch;
  notice?: (line: string) => void;
  output?: (text: string) => void;
  now?: number;
}): Promise<void>;
export function sampleFailureLines(error: unknown): string[];
