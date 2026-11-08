import { describe, expect, it } from 'vitest';

import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { defaultDigestTopics } from './defaultDigestTopics.ts';
import { DigestTopic, DigestTopicNotFoundError } from './digestTopic.ts';
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

  it('create は name が 41 文字、description が 301 文字の topic を作らず、40 文字と 300 文字は作る', () => {
    expect(DigestTopic.create({ ...payload(), name: 'あ'.repeat(41) }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), description: 'あ'.repeat(301) }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), name: 'あ'.repeat(40), description: 'あ'.repeat(300) }, now).ok).toBe(
      true,
    );
  });

  it('create は examples と excludes の既定値を空配列にする', () => {
    const created = DigestTopic.create(payload(), now);

    expect(created.ok && created.val.aggregateState).toMatchObject({ examples: [], excludes: [] });
  });

  it('create は examples と excludes を 10 件までの 1 から 120 文字で受け取る', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `文 ${i}`);

    expect(DigestTopic.create({ ...payload(), examples: ten, excludes: ten }, now).ok).toBe(true);
    expect(DigestTopic.create({ ...payload(), examples: [...ten, '十一'] }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), excludes: [...ten, '十一'] }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), examples: [''] }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), excludes: [''] }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), examples: ['あ'.repeat(121)] }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), excludes: ['あ'.repeat(121)] }, now).ok).toBe(false);
    expect(DigestTopic.create({ ...payload(), examples: ['あ'.repeat(120)], excludes: ['あ'.repeat(120)] }, now).ok)
      .toBe(true);
  });

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

  it('toEmbeddingText は「name: description」を返す', () => {
    expect(DigestTopic.toEmbeddingText({ name: 'セキュリティ', description: '脆弱性' })).toBe('セキュリティ: 脆弱性');
  });

  it('embed は 1024 次元の埋め込みを payload に持つ digestTopic.embedded を返し、embeddedAt を入れる', () => {
    const created = DigestTopic.create(payload(), now);
    if (!created.ok) throw new Error('create failed');
    const later = Instant.orThrow(now + 1_000);

    const embedded = DigestTopic.embed(created.val.aggregateState, {
      embedding: new Float32Array(1024),
      excludeEmbedding: null,
    }, later);

    expect(embedded.ok).toBe(true);
    if (!embedded.ok) return;
    expect(embedded.val.eventName).toBe('digestTopic.embedded');
    expect(embedded.val.aggregateState.embeddedAt).toBe(later);
    expect(embedded.val.eventPayload).toMatchObject({ topicKey: 'genai', embeddedAt: later });
  });

  it('embed は次元が 1024 でない埋め込みを拒否する', () => {
    const created = DigestTopic.create(payload(), now);
    if (!created.ok) throw new Error('create failed');

    expect(
      DigestTopic.embed(created.val.aggregateState, { embedding: new Float32Array(3), excludeEmbedding: null }, now).ok,
    ).toBe(false);
  });
});

describe('DigestTopic.edit', () => {
  const later = Instant.orThrow(now + 5_000);
  const created = () => {
    const result = DigestTopic.create(payload(), now);
    if (!result.ok) throw new Error('create failed');
    return { ...result.val.aggregateState, embeddedAt: now };
  };

  it('name と description を変え、embeddedAt を null に戻した digestTopic.edited を返す', () => {
    const topic = created();

    const edited = DigestTopic.edit(topic, { name: '新しい名前', description: '新しい説明' }, later);

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.val).toMatchObject({
      aggregateName: 'digestTopic',
      eventName: 'digestTopic.edited',
      aggregateId: { userId: topic.userId, topicKey: 'genai' },
      aggregateState: {
        name: '新しい名前',
        description: '新しい説明',
        embeddedAt: null,
        enabled: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: later,
      },
      eventPayload: {
        userId: topic.userId,
        topicKey: 'genai',
        name: '新しい名前',
        description: '新しい説明',
        updatedAt: later,
      },
    });
  });

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

  it('edit は 11 件の examples、11 件の excludes、121 文字の文を拒否する', () => {
    const topic = created();
    const valid = { name: '名前', description: '説明' };
    const eleven = Array.from({ length: 11 }, (_, i) => `文 ${i}`);

    expect(DigestTopic.edit(topic, { ...valid, examples: eleven }, later).ok).toBe(false);
    expect(DigestTopic.edit(topic, { ...valid, excludes: eleven }, later).ok).toBe(false);
    expect(DigestTopic.edit(topic, { ...valid, examples: ['あ'.repeat(121)] }, later).ok).toBe(false);
    expect(DigestTopic.edit(topic, { ...valid, excludes: [''] }, later).ok).toBe(false);
  });

  it('空の name、41 文字の name、空の description、301 文字の description を拒否する', () => {
    const topic = created();
    const valid = { name: '名前', description: '説明' };

    expect(DigestTopic.edit(topic, { ...valid, name: '' }, later).ok).toBe(false);
    expect(DigestTopic.edit(topic, { ...valid, name: 'あ'.repeat(41) }, later).ok).toBe(false);
    expect(DigestTopic.edit(topic, { ...valid, description: '' }, later).ok).toBe(false);
    expect(DigestTopic.edit(topic, { ...valid, description: 'あ'.repeat(301) }, later).ok).toBe(false);
    expect(DigestTopic.edit(topic, { name: 'あ'.repeat(40), description: 'あ'.repeat(300) }, later).ok).toBe(true);
  });
});

describe('DigestTopic.setEnabled', () => {
  const later = Instant.orThrow(now + 5_000);

  it('enabled と updatedAt だけを変えた digestTopic.enabledChanged を返す', () => {
    const result = DigestTopic.create(payload(), now);
    if (!result.ok) throw new Error('create failed');
    const topic = { ...result.val.aggregateState, embeddedAt: now };

    const changed = DigestTopic.setEnabled(topic, false, later);

    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.val).toMatchObject({
      aggregateName: 'digestTopic',
      eventName: 'digestTopic.enabledChanged',
      aggregateId: { userId: topic.userId, topicKey: 'genai' },
      aggregateState: { ...topic, enabled: false, updatedAt: later },
      eventPayload: { userId: topic.userId, topicKey: 'genai', enabled: false, updatedAt: later },
    });
  });
});

describe('DigestTopicNotFoundError', () => {
  it('type と topicKey を持つ', () => {
    expect(DigestTopicNotFoundError.create('genai')).toMatchObject({
      type: 'DigestTopicNotFoundError',
      detail: { topicKey: 'genai' },
    });
  });
});

describe('defaultDigestTopics', () => {
  it('7 件で、topicKey は重複せず、summary を使わない', () => {
    const keys = defaultDigestTopics.map((topic) => topic.topicKey);

    expect(keys).toEqual(['genai', 'platform', 'server', 'design', 'ciam', 'security', 'fediverse']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('defaultDigestTopics の文字数', () => {
  it('どれも name は 40 文字以内、description は 300 文字以内で、DigestTopic.create が受け付ける', () => {
    for (const [sortOrder, topic] of defaultDigestTopics.entries()) {
      expect(DigestTopic.create({ ...topic, userId: UserId.generate(), sortOrder }, now).ok).toBe(true);
    }
  });
});

describe('TOPIC_MIN_SIMILARITY', () => {
  it('0.55 である', () => {
    expect(TOPIC_MIN_SIMILARITY).toBe(0.55);
  });
});
