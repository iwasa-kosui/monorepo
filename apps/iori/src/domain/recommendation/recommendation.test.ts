import { describe, expect, it } from 'vitest';

import { FeedEntryId } from '../feedEntry/feedEntryId.ts';
import { Instant } from '../instant/instant.ts';
import { InterestSource, type InterestSourceKind } from '../interestSource/interestSource.ts';
import { InterestSourceId } from '../interestSource/interestSourceId.ts';
import {
  type ArticleVector,
  type InterestVector,
  Recommendation,
  RECOMMENDATION_NEIGHBOR_COUNT,
} from './recommendation.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 4));

const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourceId = (n: number) => InterestSourceId.orThrow(idOf(n));
const entryId = (n: number) => FeedEntryId.orThrow(idOf(n));

const material = (
  n: number,
  overrides: Partial<Omit<InterestVector, 'embedding'>> & { embedding?: number[] } = {},
): InterestVector => ({
  interestSourceId: sourceId(n),
  kind: 'kosui_post',
  weight: 1,
  occurredAt: NOW,
  ...overrides,
  embedding: Float32Array.from(overrides.embedding ?? [1, 0]),
});

const article = (
  n: number,
  overrides: Partial<Omit<ArticleVector, 'embedding'>> & { embedding?: number[] } = {},
): ArticleVector => ({
  feedEntryId: entryId(n),
  hatenaBookmarkCount: null,
  ...overrides,
  embedding: Float32Array.from(overrides.embedding ?? [1, 0]),
});

const score = (input: Partial<Parameters<typeof Recommendation.scoreArticles>[0]>) =>
  Recommendation.scoreArticles({ materials: [], articles: [], now: NOW, ...input });

describe('InterestSource.halfLivesMs', () => {
  it('kind ごとの半減期を日数で持つ', () => {
    const days = (kind: InterestSourceKind) => InterestSource.halfLivesMs[kind] / DAY_MS;

    expect(days('kosui_post')).toBe(730);
    expect(days('kosui_talk')).toBe(730);
    expect(days('kosui_external')).toBe(730);
    expect(days('own_post')).toBe(180);
    expect(days('own_like')).toBe(90);
  });
});

describe('Recommendation.scoreArticles', () => {
  it('材料か記事が空なら空配列を返す', () => {
    expect(score({})).toEqual([]);
    expect(score({ materials: [material(1)] })).toEqual([]);
    expect(score({ articles: [article(1)] })).toEqual([]);
  });

  it('寄与は 類似度 × weight × 減衰 で、半減期ぶん古い材料は半分になる', () => {
    const result = score({
      materials: [material(1, { kind: 'own_like', weight: 0.7, occurredAt: Instant.orThrow(NOW - 90 * DAY_MS) })],
      articles: [article(1)],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBeCloseTo(0.35, 10);
  });

  it('kind が違えば半減期も違う', () => {
    const occurredAt = Instant.orThrow(NOW - 180 * DAY_MS);
    const own = score({ materials: [material(1, { kind: 'own_post', occurredAt })], articles: [article(1)] });
    const kosui = score({ materials: [material(1, { kind: 'kosui_post', occurredAt })], articles: [article(1)] });

    expect(own[0]?.score).toBeCloseTo(0.5, 10);
    expect(kosui[0]?.score).toBeCloseTo(2 ** (-180 / 730), 10);
  });

  it('未来の材料は減衰を 1 にとどめる', () => {
    const result = score({
      materials: [material(1, { occurredAt: Instant.orThrow(NOW + 10 * DAY_MS) })],
      articles: [article(1)],
    });

    expect(result[0]?.score).toBeCloseTo(1, 10);
  });

  it('類似度はコサインで、ベクトルの大きさに左右されない', () => {
    const result = score({
      materials: [material(1, { embedding: [3, 4] })],
      articles: [article(1, { embedding: [30, 40] }), article(2, { embedding: [4, 3] })],
    });

    expect(result.find((r) => r.feedEntryId === entryId(1))?.score).toBeCloseTo(1, 6);
    expect(result.find((r) => r.feedEntryId === entryId(2))?.score).toBeCloseTo(24 / 25, 6);
  });

  it('スコアは寄与の上位 5 件の和で、6 件目以降は足さない', () => {
    const materials = Array.from({ length: 8 }, (_, i) => material(i + 1, { weight: i + 1 }));

    const result = score({ materials, articles: [article(1)] });

    expect(result[0]?.score).toBeCloseTo(8 + 7 + 6 + 5 + 4, 6);
  });

  it('類似度の上位 20 件に入らない材料は、weight が大きくても足さない', () => {
    const near = Array.from(
      { length: RECOMMENDATION_NEIGHBOR_COUNT },
      (_, i) => material(i + 1, { weight: 1, embedding: [1, 0.01 * (i + 1)] }),
    );
    const far = material(100, { weight: 1000, embedding: [0, 1] });

    const result = score({ materials: [...near, far], articles: [article(1)] });

    expect(result[0]?.score).toBeLessThan(6);
  });

  it('類似度の上位 20 件の選択は材料の並びに依らない', () => {
    const materials = Array.from(
      { length: 50 },
      (_, i) => material(i + 1, { weight: 1 + (i % 7), embedding: [1, 0.05 * ((i * 17) % 50)] }),
    );

    const forward = score({ materials, articles: [article(1)] });
    const backward = score({ materials: [...materials].reverse(), articles: [article(1)] });

    expect(backward[0]?.score).toBeCloseTo(forward[0]!.score, 10);
    expect(backward[0]?.reasonInterestSourceId).toBe(forward[0]?.reasonInterestSourceId);
  });

  it('関心の根拠は寄与ではなく、類似度が最も高かった材料にする', () => {
    const result = score({
      materials: [
        material(1, { weight: 0.1, embedding: [1, 0] }),
        material(2, { weight: 100, embedding: [1, 1] }),
      ],
      articles: [article(1, { embedding: [1, 0] })],
    });

    expect(result[0]?.reasonInterestSourceId).toBe(sourceId(1));
  });

  it('類似度が同じ材料は interestSourceId が小さいほうを根拠にする', () => {
    const result = score({
      materials: [material(2), material(1), material(3)],
      articles: [article(1)],
    });

    expect(result[0]?.reasonInterestSourceId).toBe(sourceId(1));
  });

  it('並びは丸めたスコアの降順で、同じ丸めなら hatenaBookmarkCount の降順、さらに同じなら feedEntryId の昇順', () => {
    const materials = [material(1, { embedding: [1, 0] })];
    const articles = [
      article(1, { embedding: [1, 0], hatenaBookmarkCount: 5 }),
      article(2, { embedding: [1, 0.3], hatenaBookmarkCount: 100 }),
      article(3, { embedding: [1, 0.31], hatenaBookmarkCount: 10 }),
      article(4, { embedding: [1, 0.305], hatenaBookmarkCount: null }),
      article(5, { embedding: [1, 0.305], hatenaBookmarkCount: null }),
      article(6, { embedding: [1, 3], hatenaBookmarkCount: 9999 }),
    ];

    const result = score({ materials, articles });

    expect(result.map((r) => r.feedEntryId)).toEqual([1, 2, 3, 4, 5, 6].map(entryId));
    expect(result[1]!.score).toBeGreaterThan(result[2]!.score);
  });

  it('丸めた値が同じなら元のスコアの大小ではなくブックマーク数で並べ、返すスコアは丸めない', () => {
    const materials = [material(1, { embedding: [1, 0] })];
    const articles = [
      article(1, { embedding: [1, 0.3], hatenaBookmarkCount: 1 }),
      article(2, { embedding: [1, 0.31], hatenaBookmarkCount: 50 }),
    ];

    const result = score({ materials, articles });

    expect(result.map((r) => r.feedEntryId)).toEqual([entryId(2), entryId(1)]);
    expect(result[0]!.score).toBeLessThan(result[1]!.score);
    expect(Math.round(result[0]!.score * 100)).toBe(Math.round(result[1]!.score * 100));
    expect(result[0]!.score * 100).not.toBe(Math.round(result[0]!.score * 100));
  });

  it('上位 N 件だけを返し、既定は 10 件', () => {
    const articles = Array.from({ length: 15 }, (_, i) => article(i + 1, { embedding: [1, i] }));

    expect(score({ materials: [material(1)], articles })).toHaveLength(10);
    expect(score({ materials: [material(1)], articles, limit: 3 }).map((r) => r.feedEntryId)).toEqual([
      entryId(1),
      entryId(2),
      entryId(3),
    ]);
  });

  it('次元が合わない組と、大きさが 0 のベクトルは寄与しない', () => {
    const result = score({
      materials: [material(1, { embedding: [1, 0, 0] }), material(2, { embedding: [0, 0] })],
      articles: [article(1, { embedding: [1, 0] })],
    });

    expect(result).toEqual([{ feedEntryId: entryId(1), score: 0, reasonInterestSourceId: sourceId(2) }]);
  });

  it('どの材料とも次元が合わない記事は返さない', () => {
    const result = score({ materials: [material(1, { embedding: [1, 0, 0] })], articles: [article(1)] });

    expect(result).toEqual([]);
  });
});
