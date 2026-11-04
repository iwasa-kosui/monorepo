import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { defaultDigestTopics } from './defaultDigestTopics.ts';
import { DigestTopic } from './digestTopic.ts';
import { TOPIC_MIN_SIMILARITY } from './topicAssignment.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 5));
const payload = () => ({
  userId: UserId.generate(),
  topicKey: 'genai',
  name: '生成 AI とエージェント',
  description: 'LLM、AI エージェント',
  sortOrder: 0,
});

describe('DigestTopic', () => {
  it('create は埋め込み前の状態の digestTopic.created を返す', () => {
    const created = DigestTopic.create(payload(), now);

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.val).toMatchObject({
      aggregateName: 'digestTopic',
      eventName: 'digestTopic.created',
      aggregateId: { topicKey: 'genai' },
      aggregateState: { topicKey: 'genai', embeddedAt: null, enabled: true, createdAt: now, updatedAt: now },
    });
  });

  it('create は topicKey、name、description が空の topic を作らない', () => {
    expect(DigestTopic.create({ ...payload(), topicKey: '' }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), name: '' }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), description: '' }, now).ok).toBe(false);
  });

  it('toEmbeddingText は「name: description」を返す', () => {
    expect(DigestTopic.toEmbeddingText({ name: 'セキュリティ', description: '脆弱性' })).toBe('セキュリティ: 脆弱性');
  });

  it('embed は 1024 次元の埋め込みを payload に持つ digestTopic.embedded を返し、embeddedAt を入れる', () => {
    const created = DigestTopic.create(payload(), now);
    if (!created.ok) throw new Error('create failed');
    const later = Instant.orThrow(now + 1_000);

    const embedded = DigestTopic.embed(created.val.aggregateState, new Float32Array(1024), later);

    expect(embedded.ok).toBe(true);
    if (!embedded.ok) return;
    expect(embedded.val.eventName).toBe('digestTopic.embedded');
    expect(embedded.val.aggregateState.embeddedAt).toBe(later);
    expect(embedded.val.eventPayload).toMatchObject({ topicKey: 'genai', embeddedAt: later });
  });

  it('embed は次元が 1024 でない埋め込みを拒否する', () => {
    const created = DigestTopic.create(payload(), now);
    if (!created.ok) throw new Error('create failed');

    expect(DigestTopic.embed(created.val.aggregateState, new Float32Array(3), now).ok).toBe(false);
  });
});

describe('defaultDigestTopics', () => {
  it('7 件で、topicKey は重複せず、summary を使わない', () => {
    const keys = defaultDigestTopics.map((topic) => topic.topicKey);

    expect(keys).toEqual(['genai', 'platform', 'server', 'design', 'ciam', 'security', 'fediverse']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('TOPIC_MIN_SIMILARITY', () => {
  it('0.40 である', () => {
    expect(TOPIC_MIN_SIMILARITY).toBe(0.4);
  });
});
