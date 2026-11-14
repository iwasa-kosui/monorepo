import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { defaultDigestTopics } from './defaultDigestTopics.ts';
import { DigestTopic } from './digestTopic.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 5));
const payload = () => ({
  userId: UserId.generate(),
  topicKey: 'genai',
  name: '生成 AI とエージェント',
  description: 'LLM、AI エージェント',
  sortOrder: 0,
});

describe('DigestTopic', () => {
  it('toEmbeddingTexts は「name: description」、examples、excludes の順に並べる', () => {
    expect(DigestTopic.toEmbeddingTexts({ name: 'N', description: 'D', examples: ['e1', 'e2'], excludes: ['x1'] }))
      .toEqual(['N: D', 'e1', 'e2', 'x1']);
  });

  it('combineEmbeddings は examples が空なら「name: description」の埋め込みをそのまま返し、excludes が空なら excludeEmbedding を null にする', () => {
    const result = DigestTopic.combineEmbeddings({ examples: [], excludes: [] }, [[3, 4]]);

    expect(Array.from(result.embedding)).toEqual([3, 4]);
    expect(result.excludeEmbedding).toBeNull();
  });

  it('combineEmbeddings は examples があれば「name: description」との平均を正規化し、excludes の平均を正規化して excludeEmbedding にする', () => {
    const result = DigestTopic.combineEmbeddings({ examples: ['e'], excludes: ['x1', 'x2'] }, [
      [2, 0],
      [0, 2],
      [0, 3],
      [0, 5],
    ]);

    expect(result.embedding[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(result.embedding[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Array.from(result.excludeEmbedding!)).toEqual([0, 1]);
  });
});

describe('DigestTopic.edit', () => {
  const later = Instant.orThrow(now + 5_000);
  const created = () => {
    const result = DigestTopic.create(payload(), now);
    if (!result.ok) throw new Error('create failed');
    return { ...result.val.aggregateState, embeddedAt: now };
  };

  it('examples と excludes が変わると embeddedAt を null に戻し、イベントに含める', () => {
    const topic = created();

    const edited = DigestTopic.edit(topic, {
      name: topic.name,
      description: topic.description,
      examples: ['例'],
      excludes: ['除く'],
    }, later);

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.val.aggregateState).toMatchObject({ embeddedAt: null, examples: ['例'], excludes: ['除く'] });
    expect(edited.val.eventPayload).toMatchObject({ examples: ['例'], excludes: ['除く'] });
  });

  it('examples と excludes を省くと、今の値を保つ', () => {
    const topic = created();
    const withLists = DigestTopic.edit(topic, {
      name: topic.name,
      description: topic.description,
      examples: ['例'],
      excludes: ['除く'],
    }, later);
    if (!withLists.ok) throw new Error('edit failed');

    const edited = DigestTopic.edit(withLists.val.aggregateState, {
      name: '新しい名前',
      description: topic.description,
    }, later);

    expect(edited.ok && edited.val.aggregateState).toMatchObject({ examples: ['例'], excludes: ['除く'] });
  });
});

describe('defaultDigestTopics の文字数', () => {
  it('どれも name は 40 文字以内、description は 300 文字以内で、DigestTopic.create が受け付ける', () => {
    for (const [sortOrder, topic] of defaultDigestTopics.entries()) {
      expect(DigestTopic.create({ ...topic, userId: UserId.generate(), sortOrder }, now).ok).toBe(true);
    }
  });
});
