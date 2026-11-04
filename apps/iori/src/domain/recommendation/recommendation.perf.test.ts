import { describe, expect, it } from 'vitest';

import { FeedEntryId } from '../feedEntry/feedEntryId.ts';
import { Instant } from '../instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../interestSource/embedding.ts';
import { interestSourceKinds } from '../interestSource/interestSource.ts';
import { InterestSourceId } from '../interestSource/interestSourceId.ts';
import { type ArticleVector, type InterestVector, Recommendation } from './recommendation.ts';

const MATERIAL_COUNT = 3000;
const ARTICLE_COUNT = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 4));

const createRandom = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const randomVector = (random: () => number): Float32Array =>
  Float32Array.from({ length: EMBEDDING_DIMENSIONS }, () => random() * 2 - 1);

describe('Recommendation.scoreArticles の計測', () => {
  it.runIf(process.env['IORI_RECOMMENDATION_PERF'] === '1')(
    `${MATERIAL_COUNT} 件の材料 × ${ARTICLE_COUNT} 件の記事（${EMBEDDING_DIMENSIONS} 次元）`,
    () => {
      const random = createRandom(20261104);
      const materials: InterestVector[] = Array.from({ length: MATERIAL_COUNT }, (_, i) => ({
        interestSourceId: InterestSourceId.generate(),
        kind: interestSourceKinds[i % interestSourceKinds.length]!,
        weight: 0.5 + random() * 0.5,
        occurredAt: Instant.orThrow(NOW - Math.floor(random() * 1000) * DAY_MS),
        embedding: randomVector(random),
      }));
      const articles: ArticleVector[] = Array.from({ length: ARTICLE_COUNT }, () => ({
        feedEntryId: FeedEntryId.generate(),
        hatenaBookmarkCount: Math.floor(random() * 500),
        embedding: randomVector(random),
      }));

      const startedAt = performance.now();
      const result = Recommendation.scoreArticles({ materials, articles, now: NOW });
      const elapsedMs = performance.now() - startedAt;

      console.info(
        `scoreArticles: ${MATERIAL_COUNT} materials x ${ARTICLE_COUNT} articles took ${elapsedMs.toFixed(1)} ms`,
      );
      expect(result).toHaveLength(10);
    },
    60_000,
  );
});
