import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1DigestTopicCreatedStore } from '../../adaptor/d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEditedStore } from '../../adaptor/d1/digestTopic/digestTopicEditedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../../adaptor/d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../../adaptor/d1/digestTopic/digestTopicsResolverByUserId.ts';
import { defaultDigestTopics } from '../../domain/digestTopic/defaultDigestTopics.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { EmbedRequest, TextEmbedder } from '../../ports/textEmbedder.ts';
import { AddDigestTopicUseCase } from '../addDigestTopic.ts';
import { EditDigestTopicUseCase } from '../editDigestTopic.ts';
import { EnsureDefaultDigestTopicsUseCase } from '../ensureDefaultDigestTopics.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 12));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const DIMENSIONS = 1024;

const axis = (index: number, scale = 1): number[] =>
  Array.from({ length: DIMENSIONS }, (_, i) => i === index ? scale : 0);

const createEmbedder = (vectors: Readonly<Record<string, number[]>>) => {
  const calls: EmbedRequest[] = [];
  const embedder: TextEmbedder = {
    embed: (request) => {
      calls.push(request);
      return RA.ok(request.texts.map((text) => vectors[text] ?? axis(999)));
    },
  };
  return { embedder, calls };
};

const setup = (embedder: TextEmbedder) => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  const digestTopicsResolverByUserId = createD1DigestTopicsResolverByUserId(db);
  const digestTopicEmbeddedStore = createD1DigestTopicEmbeddedStore(db);
  const add = AddDigestTopicUseCase.create({
    digestTopicsResolverByUserId,
    digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
    digestTopicEmbeddedStore,
    textEmbedder: embedder,
    now: () => NOW,
  });
  const edit = EditDigestTopicUseCase.create({
    digestTopicsResolverByUserId,
    digestTopicEditedStore: createD1DigestTopicEditedStore(db),
    digestTopicEmbeddedStore,
    textEmbedder: embedder,
    now: () => NOW,
  });
  const ensure = EnsureDefaultDigestTopicsUseCase.create({
    digestTopicsResolverByUserId,
    digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
    digestTopicEmbeddedStore,
    textEmbedder: embedder,
    now: () => NOW,
  });
  return { add, edit, ensure, digestTopicsResolverByUserId };
};

describe('テーマの examples と excludes の埋め込み', () => {
  it('examples と excludes が空なら、「name: description」の埋め込みをそのまま保存し、excludeEmbedding を null にする', async () => {
    const { embedder, calls } = createEmbedder({ 'N: D': axis(0, 3) });
    const { add } = setup(embedder);

    const result = await add.run({ userId: USER_ID, name: 'N', description: 'D' });

    expect(result.ok && result.val).toMatchObject({ examples: [], excludes: [], excludeEmbedding: null });
    expect(result.ok && result.val.embedding?.[0]).toBe(3);
    expect(calls).toEqual([{ model: '@cf/baai/bge-m3', texts: ['N: D'] }]);
  });

  it('examples があれば「name: description」と examples の平均を正規化して embedding にする', async () => {
    const { embedder } = createEmbedder({ 'N: D': axis(0, 2), 'e1': axis(1, 2) });
    const { add } = setup(embedder);

    const result = await add.run({ userId: USER_ID, name: 'N', description: 'D', examples: ['e1'] });

    const embedding = result.ok ? result.val.embedding : null;
    expect(embedding?.[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(embedding?.[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(embedding?.[2]).toBe(0);
    expect(result.ok && result.val.excludeEmbedding).toBeNull();
  });

  it('excludes があれば、その平均を正規化して excludeEmbedding にし、embedding には混ぜない', async () => {
    const { embedder } = createEmbedder({ 'N: D': axis(0, 2), 'x1': axis(1, 3), 'x2': axis(2, 3) });
    const { add } = setup(embedder);

    const result = await add.run({ userId: USER_ID, name: 'N', description: 'D', excludes: ['x1', 'x2'] });

    expect(result.ok && result.val.embedding?.[0]).toBe(2);
    expect(result.ok && result.val.embedding?.[1]).toBe(0);
    const exclude = result.ok ? result.val.excludeEmbedding : null;
    expect(exclude?.[1]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(exclude?.[2]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('埋め込みの呼び出しは、examples と excludes があっても 1 テーマにつき 1 回で、文は name: description、examples、excludes の順に並べる', async () => {
    const { embedder, calls } = createEmbedder({});
    const { add } = setup(embedder);

    await add.run({ userId: USER_ID, name: 'N', description: 'D', examples: ['e1', 'e2'], excludes: ['x1'] });

    expect(calls).toEqual([{ model: '@cf/baai/bge-m3', texts: ['N: D', 'e1', 'e2', 'x1'] }]);
  });

  it('examples と excludes を保存して、一覧から読み戻せる', async () => {
    const { embedder } = createEmbedder({});
    const { add, digestTopicsResolverByUserId } = setup(embedder);

    await add.run({ userId: USER_ID, name: 'N', description: 'D', examples: ['e1', 'e2'], excludes: ['x1'] });

    const topics = (await digestTopicsResolverByUserId.resolve(USER_ID)).val;
    expect(topics[0]).toMatchObject({ examples: ['e1', 'e2'], excludes: ['x1'] });
  });

  it('範囲外の examples と excludes は作らず、embed もしない', async () => {
    const { embedder, calls } = createEmbedder({});
    const { add, digestTopicsResolverByUserId } = setup(embedder);

    const tooMany = await add.run({
      userId: USER_ID,
      name: 'N',
      description: 'D',
      examples: Array.from({ length: 11 }, (_, i) => `e${i}`),
    });
    const tooLong = await add.run({ userId: USER_ID, name: 'N', description: 'D', excludes: ['あ'.repeat(121)] });

    expect(tooMany.ok).toBe(false);
    expect(tooLong.ok).toBe(false);
    expect(calls).toEqual([]);
    expect((await digestTopicsResolverByUserId.resolve(USER_ID)).val).toEqual([]);
  });

  it('既定のテーマは examples と excludes を空にして、今と同じ文で 1 回だけ embed する', async () => {
    const { embedder, calls } = createEmbedder({});
    const { ensure } = setup(embedder);

    const result = await ensure.run({ userId: USER_ID });

    expect(result.ok && result.val.topics.every((topic) => topic.examples.length === 0 && topic.excludes.length === 0))
      .toBe(true);
    expect(result.ok && result.val.topics.every((topic) => topic.excludeEmbedding === null)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.texts).toEqual(defaultDigestTopics.map((topic) => `${topic.name}: ${topic.description}`));
  });

  it('編集で examples か excludes が変わると、そのテーマを 1 回で embed し直す', async () => {
    const { embedder, calls } = createEmbedder({ 'N: D': axis(0), 'e1': axis(1), 'x1': axis(2) });
    const { add, edit } = setup(embedder);
    const added = await add.run({ userId: USER_ID, name: 'N', description: 'D' });
    if (!added.ok) throw new Error('unexpected');
    calls.length = 0;

    const result = await edit.run({
      userId: USER_ID,
      topicKey: added.val.topicKey,
      examples: ['e1'],
      excludes: ['x1'],
    });

    expect(calls).toEqual([{ model: '@cf/baai/bge-m3', texts: ['N: D', 'e1', 'x1'] }]);
    expect(result.ok && result.val).toMatchObject({ examples: ['e1'], excludes: ['x1'], embeddedAt: NOW });
    expect(result.ok && result.val.excludeEmbedding?.[2]).toBeCloseTo(1, 5);
  });

  it('編集で excludes を空にすると、excludeEmbedding を null に戻す', async () => {
    const { embedder } = createEmbedder({ 'N: D': axis(0), 'x1': axis(2) });
    const { add, edit } = setup(embedder);
    const added = await add.run({ userId: USER_ID, name: 'N', description: 'D', excludes: ['x1'] });
    if (!added.ok) throw new Error('unexpected');

    const result = await edit.run({ userId: USER_ID, topicKey: added.val.topicKey, excludes: [] });

    expect(result.ok && result.val).toMatchObject({ excludes: [], excludeEmbedding: null });
  });

  it('編集で examples と excludes が同じ値なら、書き込みも embed もしない', async () => {
    const { embedder, calls } = createEmbedder({});
    const { add, edit } = setup(embedder);
    const added = await add.run({ userId: USER_ID, name: 'N', description: 'D', examples: ['e1'], excludes: ['x1'] });
    if (!added.ok) throw new Error('unexpected');
    calls.length = 0;

    await edit.run({ userId: USER_ID, topicKey: added.val.topicKey, examples: ['e1'], excludes: ['x1'] });

    expect(calls).toEqual([]);
  });

  it('編集で範囲外の examples を渡すと、パースエラーにして何も変えない', async () => {
    const { embedder, calls } = createEmbedder({});
    const { add, edit } = setup(embedder);
    const added = await add.run({ userId: USER_ID, name: 'N', description: 'D' });
    if (!added.ok) throw new Error('unexpected');
    calls.length = 0;

    const result = await edit.run({ userId: USER_ID, topicKey: added.val.topicKey, examples: [''] });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
