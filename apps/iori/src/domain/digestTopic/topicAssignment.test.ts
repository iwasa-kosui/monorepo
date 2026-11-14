import { describe, expect, it } from 'vitest';

import { assignTopics } from './topicAssignment.ts';

const article = (name: string, ...embedding: number[]) => ({ name, embedding: Float32Array.from(embedding) });
const topic = (topicKey: string, ...embedding: number[]) => ({ topicKey, embedding: Float32Array.from(embedding) });

const policyOf = (minSimilarity: number, minMargin = 0) => ({ minSimilarity, minMargin });

describe('assignTopics', () => {
  it('類似度が最大のトピック 1 つにだけ入れる', () => {
    const near = article('near', 0.9, 0.1);
    const result = assignTopics({
      articles: [near],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0.1),
    });

    expect(result.byTopic.get('a')).toEqual([near]);
    expect(result.byTopic.get('b')).toEqual([]);
    expect(result.others).toEqual([]);
  });

  it('最大の類似度がしきい値未満なら、どのトピックにも入れず「その他」にする', () => {
    const far = article('far', 1, 1, 0);
    const result = assignTopics({
      articles: [far],
      topics: [topic('a', 1, 0, 0), topic('b', 0, 1, 0)],
      policy: policyOf(0.8),
    });

    expect(result.byTopic.get('a')).toEqual([]);
    expect(result.byTopic.get('b')).toEqual([]);
    expect(result.others).toEqual([far]);
  });

  it('類似度がしきい値と等しければトピックに入れる', () => {
    const exact = article('exact', 1, 0);
    const result = assignTopics({ articles: [exact], topics: [topic('a', 1, 0)], policy: policyOf(1) });

    expect(result.byTopic.get('a')).toEqual([exact]);
  });

  it('類似度が同じなら、先に並んでいるトピックに入れる', () => {
    const middle = article('middle', 1, 1);
    const result = assignTopics({
      articles: [middle],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0),
    });

    expect(result.byTopic.get('a')).toEqual([middle]);
    expect(result.byTopic.get('b')).toEqual([]);
  });

  it('同じトピックの記事は、渡された順を保つ', () => {
    const first = article('first', 1, 0);
    const second = article('second', 0.9, 0.1);
    const result = assignTopics({
      articles: [first, second],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0.5),
    });

    expect(result.byTopic.get('a')).toEqual([first, second]);
  });

  it('次元が違う埋め込みのトピックは飛ばし、残りのトピックで比べる', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [topic('wrong', 1, 0, 0), topic('right', 1, 0)],
      policy: policyOf(0.5),
    });

    expect(result.byTopic.get('wrong')).toEqual([]);
    expect(result.byTopic.get('right')).toEqual([target]);
  });

  it('埋め込みが無いトピックは飛ばし、比べられるトピックが無ければ「その他」にする', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [{ topicKey: 'pending', embedding: null }, topic('wrong', 1, 0, 0)],
      policy: policyOf(0),
    });

    expect(result.byTopic.get('pending')).toEqual([]);
    expect(result.others).toEqual([target]);
  });

  it('minMargin を上げると、1 位と 2 位の差が小さい記事を「その他」にする', () => {
    const clear = article('clear', 0.9, 0.1);
    const close = article('close', 1, 0.8);
    const result = assignTopics({
      articles: [clear, close],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0.4, 0.3),
    });

    expect(result.byTopic.get('a')).toEqual([clear]);
    expect(result.others).toEqual([close]);
  });

  it('差が minMargin と等しければトピックに入れる', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0.4, 1),
    });

    expect(result.byTopic.get('a')).toEqual([target]);
    expect(result.matches.get(target)?.margin).toBeCloseTo(1);
  });

  it('比べられるトピックが 1 件だけのとき、差の条件を満たす扱いにしてトピックに入れる', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [topic('a', 1, 0), topic('wrong', 1, 0, 0), { topicKey: 'pending', embedding: null }],
      policy: policyOf(0.4, 1),
    });

    expect(result.byTopic.get('a')).toEqual([target]);
    expect(result.matches.get(target)).toEqual({ similarity: 1, margin: Infinity });
    expect(result.others).toEqual([]);
  });

  it('トピックに入れた記事ごとに、1 位の類似度と 1 位と 2 位の差を返す', () => {
    const first = article('first', 0.9, 0.1);
    const second = article('second', 1, 0.8);
    const result = assignTopics({
      articles: [first, second],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0.4),
    });

    const firstMatch = result.matches.get(first)!;
    expect(firstMatch.similarity).toBeCloseTo(0.9 / Math.hypot(0.9, 0.1));
    expect(firstMatch.margin).toBeCloseTo(0.9 / Math.hypot(0.9, 0.1) - 0.1 / Math.hypot(0.9, 0.1));
    const secondMatch = result.matches.get(second)!;
    expect(secondMatch.similarity).toBeCloseTo(1 / Math.hypot(1, 0.8));
    expect(secondMatch.margin).toBeCloseTo(0.2 / Math.hypot(1, 0.8));
  });

  it('「その他」に落ちた理由ごとに件数を数える', () => {
    const tooFar = article('tooFar', -1, -1);
    const alsoTooFar = article('alsoTooFar', 0, -1);
    const close = article('close', 1, 0.8);
    const clear = article('clear', 0.9, 0.1);
    const result = assignTopics({
      articles: [tooFar, alsoTooFar, close, clear],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0.4, 0.3),
    });

    expect(result.otherCounts).toEqual({ belowMinSimilarity: 2, belowMinMargin: 1, excluded: 0, noComparableTopic: 0 });
    expect(result.others).toEqual([tooFar, alsoTooFar, close]);
  });

  it('比べられるトピックが無い記事は、類似度不足とは別に数える', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [{ topicKey: 'pending', embedding: null }],
      policy: policyOf(0),
    });

    expect(result.otherCounts).toEqual({ belowMinSimilarity: 0, belowMinMargin: 0, excluded: 0, noComparableTopic: 1 });
  });

  it('類似度が下限未満なら、差の不足ではなく類似度不足として数える', () => {
    const tie = article('tie', -1, -1);
    const result = assignTopics({
      articles: [tie],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      policy: policyOf(0.4, 0.5),
    });

    expect(result.otherCounts).toEqual({ belowMinSimilarity: 1, belowMinMargin: 0, excluded: 0, noComparableTopic: 0 });
  });
});

describe('assignTopics の除く例', () => {
  const withExclude = (topicKey: string, embedding: number[], excludeEmbedding: number[] | null) => ({
    topicKey,
    embedding: Float32Array.from(embedding),
    excludeEmbedding: excludeEmbedding === null ? null : Float32Array.from(excludeEmbedding),
  });

  it('除く例との類似度が 1 位のテーマとの類似度以上の記事は、excluded として「その他」に落とし、理由を数える', () => {
    const aboutExclude = article('aboutExclude', 1, 1);
    const aboutTopic = article('aboutTopic', 1, 0.2);
    const result = assignTopics({
      articles: [aboutExclude, aboutTopic],
      topics: [withExclude('a', [1, 0], [0, 1])],
      policy: policyOf(0.4),
    });

    expect(result.byTopic.get('a')).toEqual([aboutTopic]);
    expect(result.others).toEqual([aboutExclude]);
    expect(result.otherCounts).toEqual({ belowMinSimilarity: 0, belowMinMargin: 0, excluded: 1, noComparableTopic: 0 });
    expect(result.matches.has(aboutExclude)).toBe(false);
  });

  it('除く例との類似度が 1 位のテーマとの類似度と等しければ excluded にする', () => {
    const tie = article('tie', 1, 1);
    const result = assignTopics({
      articles: [tie],
      topics: [withExclude('a', [1, 0], [1, 0])],
      policy: policyOf(0.4),
    });

    expect(result.others).toEqual([tie]);
  });

  it('1 位でないテーマの除く例は見ない', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [withExclude('a', [1, 0], null), withExclude('b', [0, 1], [1, 0])],
      policy: policyOf(0.4),
    });

    expect(result.byTopic.get('a')).toEqual([target]);
  });

  it('類似度の下限未満の記事は、除く例があっても belowMinSimilarity として数える', () => {
    const far = article('far', -1, 1);
    const result = assignTopics({
      articles: [far],
      topics: [withExclude('a', [1, 0], [-1, 1])],
      policy: policyOf(0.9),
    });

    expect(result.otherCounts).toMatchObject({ belowMinSimilarity: 1, excluded: 0 });
  });
});
