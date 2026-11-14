import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { assignTopics, TopicAssignmentPolicy } from './topicAssignment.ts';
import {
  pickTopAndBottom,
  previewCandidates,
  previewDigestItems,
  rankTopics,
  similarityHistogram,
} from './topicPreview.ts';

const policy = TopicAssignmentPolicy.default;
const vector = (...embedding: number[]) => Float32Array.from(embedding);
const topic = (topicKey: string, embedding: Float32Array | null) => ({ topicKey, embedding });
const article = (feedEntryId: string, embedding: Float32Array) => ({
  feedEntryId,
  title: `title ${feedEntryId}`,
  url: `https://example.com/${feedEntryId}`,
  fetchedAt: Instant.orThrow(1_000),
  embedding,
});
const countOf = (bins: ReadonlyArray<{ from: number; count: number }>, from: number) =>
  bins.find((bin) => bin.from === from)?.count;

describe('rankTopics', () => {
  it('1 位と 2 位のトピックと類似度、差を返す', () => {
    const ranking = rankTopics(vector(1, 0), [
      topic('a', vector(0, 1)),
      topic('b', vector(1, 0)),
      topic('c', vector(1, 1)),
    ]);

    expect(ranking?.first).toEqual({ topicKey: 'b', similarity: 1 });
    expect(ranking?.second?.topicKey).toBe('c');
    expect(ranking?.second?.similarity).toBeCloseTo(Math.SQRT1_2, 5);
    expect(ranking?.margin).toBeCloseTo(1 - Math.SQRT1_2, 5);
  });

  it('類似度が同じなら先に並んでいるトピックを 1 位にし、差を 0 にする', () => {
    const ranking = rankTopics(vector(1, 1), [topic('a', vector(1, 0)), topic('b', vector(0, 1))]);

    expect(ranking?.first.topicKey).toBe('a');
    expect(ranking?.second?.topicKey).toBe('b');
    expect(ranking?.margin).toBe(0);
  });

  it('embedding が無いトピックと、次元が違うトピックは比べない', () => {
    const ranking = rankTopics(vector(1, 0), [
      topic('none', null),
      topic('wrong', vector(1, 0, 0)),
      topic('a', vector(0, 1)),
    ]);

    expect(ranking?.first.topicKey).toBe('a');
    expect(ranking?.second).toBeNull();
  });
});

describe('similarityHistogram', () => {
  it('-1 から 1 までを 0.05 刻みの 40 区間に分け、下限を含み上限を含まない', () => {
    const bins = similarityHistogram([0.4, 0.42, 0.449, 0.45, -1, 0.35]);

    expect(bins).toHaveLength(40);
    expect(bins[0]).toEqual({ from: -1, to: -0.95, count: 1 });
    expect(bins.at(-1)).toEqual({ from: 0.95, to: 1, count: 0 });
    expect(countOf(bins, 0.35)).toBe(1);
    expect(countOf(bins, 0.4)).toBe(3);
    expect(countOf(bins, 0.45)).toBe(1);
  });

  it('1 は最後の区間に入れ、範囲外と NaN は端に寄せるか無視する', () => {
    const bins = similarityHistogram([1, 1.2, -1.5, Number.NaN]);

    expect(countOf(bins, 0.95)).toBe(2);
    expect(countOf(bins, -1)).toBe(1);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
  });
});

describe('pickTopAndBottom', () => {
  const items = [
    { id: 'c', s: 0.5 },
    { id: 'a', s: 0.9 },
    { id: 'b', s: 0.5 },
    { id: 'd', s: 0.1 },
  ];
  const pick = (limit: number) => pickTopAndBottom(items, limit, (item) => item.s, (item) => item.id);

  it('類似度の高い順の上位と低い順の下位を limit 件ずつ切り出す', () => {
    const { top, bottom } = pick(2);

    expect(top.map((item) => item.id)).toEqual(['a', 'b']);
    expect(bottom.map((item) => item.id)).toEqual(['d', 'b']);
  });

  it('同じ類似度は key の昇順にして、結果を安定させる', () => {
    expect(pick(4).top.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(pick(4).bottom.map((item) => item.id)).toEqual(['d', 'b', 'c', 'a']);
  });
});

describe('previewCandidates', () => {
  const topics = [topic('a', vector(1, 0)), topic('b', vector(0, 1)), topic('off', null)];

  it('記事を 1 位のトピックに振り分け、件数と上位・下位と 2 位を返す', () => {
    const preview = previewCandidates({
      articles: [
        article('a1', vector(1, 0)),
        article('a2', vector(3, 1)),
        article('a3', vector(1, 1)),
        article('b1', vector(0, 1)),
      ],
      topics,
      limit: 2,
      policy,
    });

    expect(preview.total).toBe(4);
    expect(preview.byTopic.map((entry) => [entry.topicKey, entry.count])).toEqual([['a', 3], ['b', 1]]);
    const a = preview.byTopic[0]!;
    expect(a.top.map((c) => c.feedEntryId)).toEqual(['a1', 'a2']);
    expect(a.bottom.map((c) => c.feedEntryId)).toEqual(['a3', 'a2']);
    expect(a.top[0]).toMatchObject({ similarity: 1, second: { topicKey: 'b', similarity: 0 }, margin: 1 });
    expect(a.bottom[0]!.margin).toBeCloseTo(0, 5);
    expect(a.top[0]!.fetchedAt).toBe(1_000);
    const histogramTotal = preview.top1Histogram.reduce((sum, bin) => sum + bin.count, 0);
    expect(histogramTotal).toBe(4);
  });
});

describe('previewCandidates の assignment', () => {
  const topics = [topic('a', vector(1, 0)), topic('b', vector(0, 1))];
  const articles = [
    article('a1', vector(1, 0)),
    article('a2', vector(3, 1)),
    article('a3', vector(1, 1)),
    article('b1', vector(0, 1)),
  ];
  const outcomesOf = (p: TopicAssignmentPolicy) =>
    previewCandidates({ articles, topics, limit: 10, policy: p }).byTopic.flatMap((entry) =>
      entry.top.map((candidate) => [candidate.feedEntryId, candidate.assignment])
    );

  it('1 位になった記事ごとに assignment を付け、assigned の件数を assignedCount に入れる', () => {
    const preview = previewCandidates({ articles, topics, limit: 10, policy: { minSimilarity: 0.4, minMargin: 0.5 } });

    expect(preview.byTopic.map((entry) => [entry.topicKey, entry.count, entry.assignedCount])).toEqual([
      ['a', 3, 2],
      ['b', 1, 1],
    ]);
    expect(outcomesOf({ minSimilarity: 0.4, minMargin: 0.5 })).toEqual([
      ['a1', 'assigned'],
      ['a2', 'assigned'],
      ['a3', 'belowMinMargin'],
      ['b1', 'assigned'],
    ]);
    expect(outcomesOf({ minSimilarity: 0.8, minMargin: 0 })).toEqual([
      ['a1', 'assigned'],
      ['a2', 'assigned'],
      ['a3', 'belowMinSimilarity'],
      ['b1', 'assigned'],
    ]);
  });

  it('assignment が assignTopics の結果と一致する', () => {
    const policies = [
      { minSimilarity: 0.4, minMargin: 0 },
      { minSimilarity: 0.4, minMargin: 0.5 },
      { minSimilarity: 0.9, minMargin: 0 },
    ];
    for (const p of policies) {
      const assigned = assignTopics({ articles, topics, policy: p });
      const assignedIds = new Set(
        [...assigned.byTopic.values()].flat().map((entry) => entry.feedEntryId),
      );
      const otherIds = new Set(assigned.others.map((entry) => entry.feedEntryId));
      const preview = previewCandidates({ articles, topics, limit: 10, policy: p });

      for (const candidate of preview.byTopic.flatMap((entry) => entry.top)) {
        expect(candidate.assignment === 'assigned').toBe(assignedIds.has(candidate.feedEntryId));
        expect(candidate.assignment !== 'assigned').toBe(otherIds.has(candidate.feedEntryId));
      }
      for (const entry of preview.byTopic) {
        expect(entry.assignedCount).toBe(assigned.byTopic.get(entry.topicKey)!.length);
      }
    }
  });
});

describe('previewCandidates の除く例', () => {
  const topics = [
    { topicKey: 'a', embedding: vector(1, 0), excludeEmbedding: vector(0, 1) },
    { topicKey: 'b', embedding: vector(-1, 0), excludeEmbedding: null },
  ];
  const articles = [
    article('near', vector(1, 0.1)),
    article('aboutExclude', vector(1, 1)),
    article('other', vector(-1, 0.1)),
  ];

  it('assignment が excludes のあるケースでも assignTopics の結果と一致する', () => {
    const assigned = assignTopics({ articles, topics, policy });
    const assignedIds = new Set([...assigned.byTopic.values()].flat().map((entry) => entry.feedEntryId));
    const preview = previewCandidates({ articles, topics, limit: 10, policy });

    const candidates = preview.byTopic.flatMap((entry) => entry.top);
    expect(candidates).toHaveLength(articles.length);
    for (const candidate of candidates) {
      expect(candidate.assignment === 'assigned').toBe(assignedIds.has(candidate.feedEntryId));
    }
    expect(assigned.otherCounts.excluded).toBe(1);
    expect(candidates.filter((candidate) => candidate.assignment === 'excluded')).toHaveLength(1);
    for (const entry of preview.byTopic) {
      expect(entry.assignedCount).toBe(assigned.byTopic.get(entry.topicKey)!.length);
    }
  });
});

describe('previewDigestItems', () => {
  const item = (topicKey: string, embedding: Float32Array | null) => ({
    digestDate: '2026-11-05',
    topicKey,
    rank: 1,
    title: 'T',
    url: 'https://example.com/t',
    feedback: null,
    embedding,
  });
  const comparableTopics = [topic('a', vector(1, 0)), topic('b', vector(0, 1))];
  const embeddedTopics = [...comparableTopics, topic('old', vector(1, 1))];

  it('採用されたテーマと 1 位が一致するか、採用されたテーマとの類似度を返す', () => {
    const [match, mismatch] = previewDigestItems({
      items: [item('a', vector(1, 0)), item('b', vector(1, 0))],
      comparableTopics,
      embeddedTopics,
      policy,
    });

    expect(match).toMatchObject({
      first: { topicKey: 'a', similarity: 1 },
      second: { topicKey: 'b', similarity: 0 },
      margin: 1,
      adoptedSimilarity: 1,
      matchesFirst: true,
    });
    expect(mismatch).toMatchObject({ adoptedSimilarity: 0, matchesFirst: false });
  });

  it('assignment が assignTopics の結果と一致する', () => {
    const embeddings = [vector(1, 0), vector(3, 1), vector(1, 1), vector(0, 1), vector(-1, 0)];
    const policies = [
      { minSimilarity: 0.4, minMargin: 0 },
      { minSimilarity: 0.4, minMargin: 0.5 },
      { minSimilarity: 0.9, minMargin: 0 },
    ];
    for (const p of policies) {
      const assigned = assignTopics({
        articles: embeddings.map((embedding) => ({ embedding })),
        topics: comparableTopics,
        policy: p,
      });
      const previews = previewDigestItems({
        items: embeddings.map((embedding) => item('a', embedding)),
        comparableTopics,
        embeddedTopics,
        policy: p,
      });

      expect(previews.filter((entry) => entry.assignment === 'assigned')).toHaveLength(
        [...assigned.byTopic.values()].flat().length,
      );
      for (const outcome of ['belowMinSimilarity', 'belowMinMargin', 'noComparableTopic'] as const) {
        expect(previews.filter((entry) => entry.assignment === outcome)).toHaveLength(assigned.otherCounts[outcome]);
      }
    }
  });
});
