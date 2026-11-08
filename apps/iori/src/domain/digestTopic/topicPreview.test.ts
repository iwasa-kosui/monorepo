import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import {
  pickTopAndBottom,
  previewCandidates,
  previewDigestItems,
  rankTopics,
  similarityHistogram,
} from './topicPreview.ts';

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

  it('比べられるトピックが 1 つなら、2 位と差を null にする', () => {
    const ranking = rankTopics(vector(1, 0), [topic('a', vector(1, 0))]);

    expect(ranking).toEqual({ first: { topicKey: 'a', similarity: 1 }, second: null, margin: null });
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

  it('比べられるトピックが無ければ null を返す', () => {
    expect(rankTopics(vector(1, 0), [])).toBeNull();
    expect(rankTopics(vector(1, 0), [topic('none', null)])).toBeNull();
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

  it('値が無くても全区間を 0 件で返す', () => {
    const bins = similarityHistogram([]);

    expect(bins).toHaveLength(40);
    expect(bins.every((bin) => bin.count === 0)).toBe(true);
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

  it('件数が limit より少なければ全件を返し、元の配列を並べ替えない', () => {
    const { top, bottom } = pick(10);

    expect(top).toHaveLength(4);
    expect(bottom).toHaveLength(4);
    expect(items.map((item) => item.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('空配列なら空を返す', () => {
    expect(pickTopAndBottom([], 3, () => 0, () => '')).toEqual({ top: [], bottom: [] });
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

  it('1 位になった記事が無いトピックも、件数 0 で返す', () => {
    const preview = previewCandidates({ articles: [article('a1', vector(1, 0))], topics, limit: 5 });

    expect(preview.byTopic[1]).toEqual({ topicKey: 'b', count: 0, top: [], bottom: [] });
  });

  it('記事が無いとき、トピックが無いときも落ちずに空の結果を返す', () => {
    const noArticles = previewCandidates({ articles: [], topics, limit: 5 });
    const noTopics = previewCandidates({ articles: [article('a1', vector(1, 0))], topics: [], limit: 5 });

    expect(noArticles.total).toBe(0);
    expect(noArticles.byTopic).toHaveLength(2);
    expect(noTopics).toMatchObject({ total: 1, byTopic: [] });
    expect(noTopics.top1Histogram.every((bin) => bin.count === 0)).toBe(true);
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

  it('無効になったテーマが採用されていても、embedding があれば類似度を出す', () => {
    const [result] = previewDigestItems({ items: [item('old', vector(1, 0))], comparableTopics, embeddedTopics });

    expect(result!.adoptedSimilarity).toBeCloseTo(Math.SQRT1_2, 5);
    expect(result!.matchesFirst).toBe(false);
  });

  it('記事の embedding が無い項目は、類似度と一致を null にする', () => {
    const [result] = previewDigestItems({ items: [item('a', null)], comparableTopics, embeddedTopics });

    expect(result).toEqual({
      digestDate: '2026-11-05',
      topicKey: 'a',
      rank: 1,
      title: 'T',
      url: 'https://example.com/t',
      feedback: null,
      first: null,
      second: null,
      margin: null,
      adoptedSimilarity: null,
      matchesFirst: null,
    });
  });

  it('採用されたテーマが消えているときは adoptedSimilarity を null にする', () => {
    const [result] = previewDigestItems({ items: [item('gone', vector(1, 0))], comparableTopics, embeddedTopics });

    expect(result).toMatchObject({ adoptedSimilarity: null, matchesFirst: false });
  });

  it('比べられるテーマが無いときは first と matchesFirst を null にする', () => {
    const [result] = previewDigestItems({ items: [item('a', vector(1, 0))], comparableTopics: [], embeddedTopics });

    expect(result).toMatchObject({ first: null, matchesFirst: null, adoptedSimilarity: 1 });
  });
});
