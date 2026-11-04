import { describe, expect, it } from 'vitest';

import { assignTopics } from './topicAssignment.ts';

const article = (name: string, ...embedding: number[]) => ({ name, embedding: Float32Array.from(embedding) });
const topic = (topicKey: string, ...embedding: number[]) => ({ topicKey, embedding: Float32Array.from(embedding) });

describe('assignTopics', () => {
  it('類似度が最大のトピック 1 つにだけ入れる', () => {
    const near = article('near', 0.9, 0.1);
    const result = assignTopics({
      articles: [near],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      minSimilarity: 0.1,
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
      minSimilarity: 0.8,
    });

    expect(result.byTopic.get('a')).toEqual([]);
    expect(result.byTopic.get('b')).toEqual([]);
    expect(result.others).toEqual([far]);
  });

  it('類似度がしきい値と等しければトピックに入れる', () => {
    const exact = article('exact', 1, 0);
    const result = assignTopics({ articles: [exact], topics: [topic('a', 1, 0)], minSimilarity: 1 });

    expect(result.byTopic.get('a')).toEqual([exact]);
  });

  it('類似度が同じなら、先に並んでいるトピックに入れる', () => {
    const middle = article('middle', 1, 1);
    const result = assignTopics({
      articles: [middle],
      topics: [topic('a', 1, 0), topic('b', 0, 1)],
      minSimilarity: 0,
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
      minSimilarity: 0.5,
    });

    expect(result.byTopic.get('a')).toEqual([first, second]);
  });

  it('次元が違う埋め込みのトピックは飛ばし、残りのトピックで比べる', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [topic('wrong', 1, 0, 0), topic('right', 1, 0)],
      minSimilarity: 0.5,
    });

    expect(result.byTopic.get('wrong')).toEqual([]);
    expect(result.byTopic.get('right')).toEqual([target]);
  });

  it('埋め込みが無いトピックは飛ばし、比べられるトピックが無ければ「その他」にする', () => {
    const target = article('target', 1, 0);
    const result = assignTopics({
      articles: [target],
      topics: [{ topicKey: 'pending', embedding: null }, topic('wrong', 1, 0, 0)],
      minSimilarity: 0,
    });

    expect(result.byTopic.get('pending')).toEqual([]);
    expect(result.others).toEqual([target]);
  });

  it('記事もトピックも無ければ、空の結果を返す', () => {
    const result = assignTopics({ articles: [], topics: [], minSimilarity: 0.45 });

    expect([...result.byTopic.keys()]).toEqual([]);
    expect(result.others).toEqual([]);
  });
});
