import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { StoredDigestTopic } from '../../domain/digestTopic/digestTopic.ts';
import { TOPIC_MIN_SIMILARITY } from '../../domain/digestTopic/topicAssignment.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import { PreviewDigestTopicsUseCase } from '../previewDigestTopics.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 20, 0));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const HOUR_MS = 60 * 60 * 1000;

const topic = (topicKey: string, embedding: Float32Array | null, enabled = true): StoredDigestTopic => ({
  userId: USER_ID,
  topicKey,
  name: topicKey,
  description: topicKey,
  embeddedAt: embedding === null ? null : Instant.orThrow(1),
  sortOrder: 0,
  enabled,
  createdAt: Instant.orThrow(1),
  updatedAt: Instant.orThrow(1),
  embedding,
});

const setup = (topics: ReadonlyArray<StoredDigestTopic> = []) => {
  const resolveTopics = vi.fn(() => RA.ok(topics));
  const resolveArticles = vi.fn(() => RA.ok([]));
  const resolveItems = vi.fn(() => RA.ok([]));
  const useCase = PreviewDigestTopicsUseCase.create({
    digestTopicsResolverByUserId: { resolve: resolveTopics },
    recommendableArticlesResolverByFetchedSince: { resolve: resolveArticles },
    digestTopicItemsResolverByUserIdAndDigestDateFrom: { resolve: resolveItems },
    now: () => NOW,
  });
  return { useCase, resolveTopics, resolveArticles, resolveItems };
};

describe('PreviewDigestTopicsUseCase', () => {
  it('候補記事は candidateHours 時間前から、ダイジェスト項目は JST の digestDays 日分だけ読む', async () => {
    const { useCase, resolveTopics, resolveArticles, resolveItems } = setup();

    await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(resolveTopics).toHaveBeenCalledWith(USER_ID);
    expect(resolveArticles).toHaveBeenCalledWith({ fetchedSince: NOW - 72 * HOUR_MS });
    expect(resolveItems).toHaveBeenCalledWith({ userId: USER_ID, digestDateFrom: '2026-10-27' });
  });

  it('digestDays が 1 なら、JST の今日だけを読む', async () => {
    const { useCase, resolveItems } = setup();

    await useCase.run({ userId: USER_ID, candidateHours: 1, digestDays: 1, limit: 1 });

    expect(resolveItems).toHaveBeenCalledWith({ userId: USER_ID, digestDateFrom: '2026-11-09' });
  });

  it('テーマが無くても空の結果とふり分けのしきい値を返す', async () => {
    const { useCase } = setup();

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(result).toMatchObject({
      ok: true,
      val: {
        topics: [],
        thresholds: { topicMinSimilarity: TOPIC_MIN_SIMILARITY },
        candidates: { total: 0, byTopic: [] },
        digestItems: [],
      },
    });
  });

  it('無効なテーマと未埋め込みのテーマは、候補記事の比較に使わない', async () => {
    const { useCase } = setup([
      topic('on', new Float32Array([1, 0])),
      topic('off', new Float32Array([0, 1]), false),
      topic('raw', null),
    ]);

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(result.ok && result.val.candidates.byTopic.map((entry) => entry.topicKey)).toEqual(['on']);
    expect(result.ok && result.val.topics.map((entry) => entry.topicKey)).toEqual(['on', 'off', 'raw']);
  });
});
