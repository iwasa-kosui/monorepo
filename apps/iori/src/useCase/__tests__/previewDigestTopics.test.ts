import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { DigestTopicItem } from '../../domain/digest/digest.ts';
import type { StoredDigestTopic } from '../../domain/digestTopic/digestTopic.ts';
import { assignTopics, TopicAssignmentPolicy } from '../../domain/digestTopic/topicAssignment.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { RecommendableArticle } from '../../domain/recommendation/recommendation.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { TopicRelevanceJudge } from '../../ports/topicRelevanceJudge.ts';
import {
  JEV_CANDIDATES_PER_TOPIC,
  JEV_CANDIDATES_TOTAL_LIMIT,
  JEV_MODEL,
  JEV_TIMEOUT_MS,
  MAX_PREVIEW_CANDIDATES,
  MAX_PREVIEW_DIGEST_ITEMS,
  PreviewDigestTopicsUseCase,
} from '../previewDigestTopics.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8, 20, 0));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const HOUR_MS = 60 * 60 * 1000;

const topic = (topicKey: string, embedding: Float32Array | null, enabled = true): StoredDigestTopic => ({
  userId: USER_ID,
  topicKey,
  name: topicKey,
  description: topicKey,
  examples: [],
  excludes: [],
  embeddedAt: embedding === null ? null : Instant.orThrow(1),
  sortOrder: 0,
  enabled,
  materialWindowHours: null,
  createdAt: Instant.orThrow(1),
  updatedAt: Instant.orThrow(1),
  embedding,
  excludeEmbedding: null,
});

const article = (n: number): RecommendableArticle =>
  ({
    feedEntryId: `entry-${n}`,
    feedSourceId: `source-${n}`,
    sourceKind: 'rss',
    url: `https://example.com/${n}`,
    title: `記事 ${n}`,
    description: '',
    hatenaBookmarkCount: null,
    fetchedAt: Instant.orThrow(1),
    embedding: new Float32Array([1, 0]),
  }) as unknown as RecommendableArticle;

const digestItem = (n: number): DigestTopicItem => ({
  digestDate: '2026-11-08',
  topicKey: 'on',
  rank: n,
  title: `項目 ${n}`,
  url: `https://example.com/${n}`,
  feedback: null,
  embedding: new Float32Array([1, 0]),
});

const setup = (
  topics: ReadonlyArray<StoredDigestTopic> = [],
  options: {
    articles?: ReadonlyArray<RecommendableArticle>;
    items?: ReadonlyArray<DigestTopicItem>;
    maxCandidates?: number;
    maxDigestItems?: number;
    topicAssignmentPolicy?: TopicAssignmentPolicy;
    topicRelevanceJudge?: TopicRelevanceJudge;
    sleep?: (ms: number) => Promise<void>;
  } = {},
) => {
  const resolveTopics = vi.fn(() => RA.ok(topics));
  const resolveArticles = vi.fn((_: unknown) => RA.ok(options.articles ?? []));
  const resolveItems = vi.fn((_: unknown) => RA.ok(options.items ?? []));
  const useCase = PreviewDigestTopicsUseCase.create({
    digestTopicsResolverByUserId: { resolve: resolveTopics },
    recommendableArticlesResolverByFetchedSince: { resolve: resolveArticles },
    digestTopicItemsResolverByUserIdAndDigestDateFrom: { resolve: resolveItems },
    maxCandidates: options.maxCandidates,
    maxDigestItems: options.maxDigestItems,
    topicAssignmentPolicy: options.topicAssignmentPolicy,
    topicRelevanceJudge: options.topicRelevanceJudge,
    sleep: options.sleep,
    now: () => NOW,
  });
  return { useCase, resolveTopics, resolveArticles, resolveItems };
};

describe('PreviewDigestTopicsUseCase', () => {
  it('候補記事は candidateHours 時間前から、ダイジェスト項目は JST の digestDays 日分だけ読む', async () => {
    const { useCase, resolveTopics, resolveArticles, resolveItems } = setup();

    await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(resolveTopics).toHaveBeenCalledWith(USER_ID);
    expect(resolveArticles).toHaveBeenCalledWith({
      fetchedSince: NOW - 72 * HOUR_MS,
      limit: MAX_PREVIEW_CANDIDATES + 1,
    });
    expect(resolveItems).toHaveBeenCalledWith({
      userId: USER_ID,
      digestDateFrom: '2026-10-27',
      limit: MAX_PREVIEW_DIGEST_ITEMS + 1,
    });
  });

  it('digestDays が 1 なら、JST の今日だけを読む', async () => {
    const { useCase, resolveItems } = setup();

    await useCase.run({ userId: USER_ID, candidateHours: 1, digestDays: 1, limit: 1 });

    expect(resolveItems).toHaveBeenCalledWith({
      userId: USER_ID,
      digestDateFrom: '2026-11-09',
      limit: MAX_PREVIEW_DIGEST_ITEMS + 1,
    });
  });

  it('テーマが無くても空の結果とふり分けのしきい値を返す', async () => {
    const { useCase } = setup();

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(result).toMatchObject({
      ok: true,
      val: {
        topics: [],
        thresholds: TopicAssignmentPolicy.default,
        candidates: { total: 0, byTopic: [], truncated: false },
        digestItems: [],
        digestItemsTruncated: false,
      },
    });
  });

  it('テーマの除く例に近い候補記事とダイジェスト項目を excluded にし、除く例との類似度を返す', async () => {
    const excluding = { ...topic('on', new Float32Array([1, 0])), excludeEmbedding: new Float32Array([1, 0]) };
    const { useCase } = setup([excluding], { articles: [article(1)], items: [digestItem(1)] });

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(result.ok && result.val.candidates.byTopic[0]).toMatchObject({
      assignedCount: 0,
      top: [{ excludeSimilarity: 1, assignment: 'excluded' }],
    });
    expect(result.ok && result.val.digestItems[0]).toMatchObject({ excludeSimilarity: 1, assignment: 'excluded' });
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

  it('候補記事が上限を超えたら truncated を true にして、上限の件数で切る', async () => {
    const { useCase, resolveArticles } = setup([topic('on', new Float32Array([1, 0]))], {
      articles: [1, 2, 3, 4].map(article),
      maxCandidates: 3,
    });

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(resolveArticles).toHaveBeenCalledWith({ fetchedSince: NOW - 72 * HOUR_MS, limit: 4 });
    expect(result.ok && result.val.candidates.truncated).toBe(true);
    expect(result.ok && result.val.candidates.total).toBe(3);
  });

  it('候補記事が上限ちょうどなら truncated は false で、全件を使う', async () => {
    const { useCase } = setup([topic('on', new Float32Array([1, 0]))], {
      articles: [1, 2, 3].map(article),
      maxCandidates: 3,
    });

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(result.ok && result.val.candidates.truncated).toBe(false);
    expect(result.ok && result.val.candidates.total).toBe(3);
  });

  it('ダイジェスト項目が上限を超えたら digestItemsTruncated を true にして、上限の件数で切る', async () => {
    const { useCase, resolveItems } = setup([topic('on', new Float32Array([1, 0]))], {
      items: [1, 2, 3].map(digestItem),
      maxDigestItems: 2,
    });

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(resolveItems).toHaveBeenCalledWith({ userId: USER_ID, digestDateFrom: '2026-10-27', limit: 3 });
    expect(result.ok && result.val.digestItemsTruncated).toBe(true);
    expect(result.ok && result.val.digestItems.map((item) => item.rank)).toEqual([1, 2]);
  });

  it('ダイジェスト項目が上限ちょうどなら digestItemsTruncated は false で、全件を使う', async () => {
    const { useCase } = setup([topic('on', new Float32Array([1, 0]))], {
      items: [1, 2].map(digestItem),
      maxDigestItems: 2,
    });

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(result.ok && result.val.digestItemsTruncated).toBe(false);
    expect(result.ok && result.val.digestItems).toHaveLength(2);
  });

  it('thresholds は TopicAssignmentPolicy.default と一致する', async () => {
    const { useCase } = setup();

    const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });

    expect(result.ok && result.val.thresholds).toEqual(TopicAssignmentPolicy.default);
  });

  describe('方針', () => {
    const tied = (n: number): RecommendableArticle =>
      ({ ...article(n), embedding: new Float32Array([1, 1]) }) as unknown as RecommendableArticle;
    const tiedItem = (n: number): DigestTopicItem => ({ ...digestItem(n), embedding: new Float32Array([1, 1]) });
    const topics = [topic('on', new Float32Array([1, 0])), topic('next', new Float32Array([0, 1]))];
    const options = { articles: [article(1), tied(2)], items: [digestItem(1), tiedItem(2)] };
    const run = async (policy?: TopicAssignmentPolicy) => {
      const { useCase } = setup(topics, { ...options, topicAssignmentPolicy: policy });
      const result = await useCase.run({ userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 });
      if (!result.ok) throw new Error('unreachable');
      return result.val;
    };

    it('渡した方針を thresholds に返し、方針を差し替えると assignment と assignedCount が変わる', async () => {
      const byDefault = await run();
      const strict = await run({ minSimilarity: 0.4, minMargin: 0.5 });

      expect(byDefault.candidates.byTopic[0]).toMatchObject({ count: 2, assignedCount: 2 });
      expect(byDefault.digestItems.map((item) => item.assignment)).toEqual(['assigned', 'assigned']);
      expect(strict.thresholds).toEqual({ minSimilarity: 0.4, minMargin: 0.5 });
      expect(strict.candidates.byTopic[0]).toMatchObject({ count: 2, assignedCount: 1 });
      expect(strict.candidates.byTopic[0]!.top.map((candidate) => candidate.assignment)).toEqual([
        'assigned',
        'belowMinMargin',
      ]);
      expect(strict.digestItems.map((item) => item.assignment)).toEqual(['assigned', 'belowMinMargin']);
    });

    it('assignment が同じ入力に対する assignTopics の結果と一致する', async () => {
      const policy = { minSimilarity: 0.4, minMargin: 0.5 };
      const result = await run(policy);
      const assigned = assignTopics({
        articles: options.articles,
        topics,
        policy,
      });

      const preview = result.candidates.byTopic;
      expect(preview.map((entry) => entry.assignedCount)).toEqual(
        topics.map((entry) => assigned.byTopic.get(entry.topicKey)!.length),
      );
      const flagged = preview.flatMap((entry) => entry.top).filter((candidate) => candidate.assignment !== 'assigned');
      expect(flagged.map((candidate) => candidate.feedEntryId)).toEqual(
        assigned.others.map((entry) => entry.feedEntryId),
      );
    });
  });

  describe('Jev の判定', () => {
    const topics = [topic('on', new Float32Array([1, 0]))];
    const withDescription = (n: number, description: string): RecommendableArticle =>
      ({ ...article(n), description }) as unknown as RecommendableArticle;
    const articles = [1, 2, 3, 4, 5, 6, 7].map((n) => withDescription(n, `本文 ${n}`));
    const input = { userId: USER_ID, candidateHours: 72, digestDays: 14, limit: 30 } as const;
    const judgeBy = (noulOf: (title: string) => number): TopicRelevanceJudge => ({
      judge: vi.fn(({ article: target }) => RA.ok({ noul: noulOf(target.title) })),
    });

    it('withJev を付けないときは、判定を呼ばず、jevNoul も jev も応答に入れない', async () => {
      const topicRelevanceJudge = judgeBy(() => 0.5);
      const { useCase } = setup(topics, { articles, topicRelevanceJudge });

      const result = await useCase.run(input);

      expect(topicRelevanceJudge.judge).not.toHaveBeenCalled();
      expect(result.ok && result.val.jev).toBeNull();
      const candidates = result.ok ? result.val.candidates.byTopic[0]!.top : [];
      expect(candidates).toHaveLength(7);
      expect(candidates.every((candidate) => !('jevNoul' in candidate))).toBe(true);
    });

    it('withJev を付けると、テーマごとの上位の上限までを、テーマの名前と説明、記事のタイトルと本文の冒頭で判定する', async () => {
      const topicRelevanceJudge = judgeBy((title) => Number(title.replace('記事 ', '')) / 10);
      const { useCase } = setup(topics, { articles, topicRelevanceJudge });

      const result = await useCase.run({ ...input, withJev: true });

      const candidates = result.ok ? result.val.candidates.byTopic[0]!.top : [];
      expect(candidates.map((candidate) => candidate.jevNoul)).toEqual([
        0.1,
        0.2,
        0.3,
        0.4,
        0.5,
        undefined,
        undefined,
      ]);
      expect(topicRelevanceJudge.judge).toHaveBeenCalledTimes(JEV_CANDIDATES_PER_TOPIC);
      expect(topicRelevanceJudge.judge).toHaveBeenCalledWith({
        model: JEV_MODEL,
        topic: { name: 'on', description: 'on' },
        article: { title: '記事 1', excerpt: '本文 1' },
      });
      expect(result.ok && result.val.jev).toEqual({
        model: 'typesafe/jev',
        configured: true,
        perTopicLimit: JEV_CANDIDATES_PER_TOPIC,
        totalLimit: JEV_CANDIDATES_TOTAL_LIMIT,
        overTotalLimit: false,
      });
    });

    describe('リクエスト全体の上限', () => {
      const dimensions = 13;
      const oneHot = (index: number) => Float32Array.from({ length: dimensions }, (_, i) => (i === index ? 1 : 0));
      const manyTopics = (count: number) => Array.from({ length: count }, (_, i) => topic(`t${i}`, oneHot(i)));
      const manyArticles = (count: number) =>
        Array.from({ length: count * JEV_CANDIDATES_PER_TOPIC }, (_, n) =>
          ({
            ...article(n),
            embedding: oneHot(Math.floor(n / JEV_CANDIDATES_PER_TOPIC)),
          }) as unknown as RecommendableArticle);

      it('テーマの順に上から数えて上限を超えた候補は判定せず、jevNoul を付けずに、overTotalLimit を true で返す', async () => {
        const topicRelevanceJudge = judgeBy(() => 0.5);
        const { useCase } = setup(manyTopics(13), { articles: manyArticles(13), topicRelevanceJudge });

        const result = await useCase.run({ ...input, withJev: true });

        expect(topicRelevanceJudge.judge).toHaveBeenCalledTimes(JEV_CANDIDATES_TOTAL_LIMIT);
        const byTopic = result.ok ? result.val.candidates.byTopic : [];
        expect(byTopic.slice(0, 12).every((entry) => entry.top.every((candidate) => candidate.jevNoul === 0.5)))
          .toBe(true);
        expect(byTopic[12]!.top).toHaveLength(JEV_CANDIDATES_PER_TOPIC);
        expect(byTopic[12]!.top.every((candidate) => !('jevNoul' in candidate))).toBe(true);
        expect(result.ok && result.val.jev).toMatchObject({
          totalLimit: JEV_CANDIDATES_TOTAL_LIMIT,
          overTotalLimit: true,
        });
      });

      it('上限の途中でテーマの上位が切れるときは、そのテーマの上から上限までを判定する', async () => {
        const topicRelevanceJudge = judgeBy(() => 0.5);
        const { useCase } = setup(manyTopics(13), {
          articles: manyArticles(13).slice(0, 62),
          topicRelevanceJudge,
        });

        const result = await useCase.run({ ...input, withJev: true });

        expect(topicRelevanceJudge.judge).toHaveBeenCalledTimes(JEV_CANDIDATES_TOTAL_LIMIT);
        const byTopic = result.ok ? result.val.candidates.byTopic : [];
        expect(byTopic[12]!.top).toHaveLength(2);
        expect(byTopic[12]!.top.every((candidate) => !('jevNoul' in candidate))).toBe(true);
      });

      it('上限ちょうどまでなら、すべて判定して overTotalLimit を false で返す', async () => {
        const topicRelevanceJudge = judgeBy(() => 0.5);
        const { useCase } = setup(manyTopics(12), { articles: manyArticles(12), topicRelevanceJudge });

        const result = await useCase.run({ ...input, withJev: true });

        expect(topicRelevanceJudge.judge).toHaveBeenCalledTimes(JEV_CANDIDATES_TOTAL_LIMIT);
        expect(result.ok && result.val.jev).toMatchObject({ overTotalLimit: false });
      });
    });

    it('本文は冒頭の 500 文字だけを渡す', async () => {
      const topicRelevanceJudge = judgeBy(() => 0.5);
      const { useCase } = setup(topics, {
        articles: [withDescription(1, 'あ'.repeat(800))],
        topicRelevanceJudge,
      });

      await useCase.run({ ...input, withJev: true });

      expect(topicRelevanceJudge.judge).toHaveBeenCalledWith(
        expect.objectContaining({ article: { title: '記事 1', excerpt: 'あ'.repeat(500) } }),
      );
    });

    it('判定の呼び出しは、候補の数だけ待たずに並列で始める', async () => {
      const started: string[] = [];
      const topicRelevanceJudge: TopicRelevanceJudge = {
        judge: ({ article: target }) => {
          started.push(target.title);
          return new Promise(() => undefined) as never;
        },
      };
      const { useCase } = setup(topics, { articles, topicRelevanceJudge, sleep: () => new Promise(() => undefined) });

      void useCase.run({ ...input, withJev: true });
      await vi.waitFor(() => expect(started).toHaveLength(JEV_CANDIDATES_PER_TOPIC));
    });

    it('判定が失敗した候補は jevNoul を null にし、ほかの候補とプレビュー全体は成功させる', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const topicRelevanceJudge: TopicRelevanceJudge = {
        judge: ({ article: target }) =>
          target.title === '記事 2'
            ? RA.err({ type: 'AiError', message: 'boom' })
            : RA.ok({ noul: 0.9 }),
      };
      const { useCase } = setup(topics, { articles: articles.slice(0, 3), topicRelevanceJudge });

      const result = await useCase.run({ ...input, withJev: true });

      expect(result.ok && result.val.candidates.byTopic[0]!.top.map((candidate) => candidate.jevNoul)).toEqual([
        0.9,
        null,
        0.9,
      ]);
      expect(JSON.stringify(error.mock.calls)).not.toContain('boom');
      expect(error).toHaveBeenCalledWith('iori digest preview: judging a candidate with Jev failed.', {
        feedEntryId: 'entry-2',
      });
      error.mockRestore();
    });

    it('判定が期限を過ぎた候補は jevNoul を null にして返す', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const topicRelevanceJudge: TopicRelevanceJudge = { judge: () => new Promise(() => undefined) as never };
      const sleep = vi.fn((_: number) => Promise.resolve());
      const { useCase } = setup(topics, { articles: articles.slice(0, 2), topicRelevanceJudge, sleep });

      const result = await useCase.run({ ...input, withJev: true });

      expect(sleep).toHaveBeenCalledWith(JEV_TIMEOUT_MS);
      expect(result.ok && result.val.candidates.byTopic[0]!.top.map((candidate) => candidate.jevNoul)).toEqual([
        null,
        null,
      ]);
      error.mockRestore();
    });

    it('判定が未設定のときは、上位の候補の jevNoul を null にして、configured を false で返す', async () => {
      const { useCase } = setup(topics, { articles: articles.slice(0, 2) });

      const result = await useCase.run({ ...input, withJev: true });

      expect(result.ok && result.val.candidates.byTopic[0]!.top.map((candidate) => candidate.jevNoul)).toEqual([
        null,
        null,
      ]);
      expect(result.ok && result.val.jev).toMatchObject({ configured: false });
    });
  });
});
