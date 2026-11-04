import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1DigestTopicCreatedStore } from '../../adaptor/d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../../adaptor/d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../../adaptor/d1/digestTopic/digestTopicsResolverByUserId.ts';
import { defaultDigestTopics } from '../../domain/digestTopic/defaultDigestTopics.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import { createStubEmbedder } from '../../testing/aiStubs.ts';
import { EnsureDefaultDigestTopicsUseCase } from '../ensureDefaultDigestTopics.ts';
import { INTEREST_EMBEDDING_MODEL } from '../helper/embedInterestSources.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 11, 5, 12));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');

const setup = (options: { textEmbedder?: TextEmbedder | null } = {}) => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  const stub = createStubEmbedder(1024);
  const digestTopicsResolverByUserId = createD1DigestTopicsResolverByUserId(db);
  const build = (textEmbedder: TextEmbedder | undefined) =>
    EnsureDefaultDigestTopicsUseCase.create({
      digestTopicsResolverByUserId,
      digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
      digestTopicEmbeddedStore: createD1DigestTopicEmbeddedStore(db),
      textEmbedder,
      now: () => NOW,
    });
  const ensure = build(options.textEmbedder === null ? undefined : options.textEmbedder ?? stub.embedder);
  const rows = () =>
    sqlite.prepare(
      'SELECT topicKey, name, description, sortOrder, enabled, embeddedAt, length(embedding) AS bytes FROM digest_topics WHERE userId = ? ORDER BY sortOrder',
    ).all(USER_ID) as Array<{
      topicKey: string;
      name: string;
      description: string;
      sortOrder: number;
      enabled: number;
      embeddedAt: number | null;
      bytes: number | null;
    }>;
  return { sqlite, db, stub, ensure, build, rows, digestTopicsResolverByUserId };
};

afterEach(() => vi.restoreAllMocks());

describe('EnsureDefaultDigestTopics', () => {
  it('既定の 7 件を sortOrder の順に作り、name と description を「name: description」で 1 回だけ embed して保存する', async () => {
    const { stub, ensure, rows } = setup();

    expect(await ensure.run({ userId: USER_ID })).toEqual({ ok: true, val: { created: 7, embedded: 7 } });

    expect(rows()).toEqual(defaultDigestTopics.map((topic, sortOrder) => ({
      ...topic,
      sortOrder,
      enabled: 1,
      embeddedAt: NOW,
      bytes: 4096,
    })));
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.model).toBe(INTEREST_EMBEDDING_MODEL);
    expect(stub.calls[0]?.texts).toEqual(defaultDigestTopics.map((topic) => `${topic.name}: ${topic.description}`));
  });

  it('もう一度走らせても、作成も embed もしない', async () => {
    const { stub, ensure, rows } = setup();
    await ensure.run({ userId: USER_ID });

    expect(await ensure.run({ userId: USER_ID })).toEqual({ ok: true, val: { created: 0, embedded: 0 } });

    expect(stub.calls).toHaveLength(1);
    expect(rows()).toHaveLength(7);
  });

  it('足りない topicKey だけを作り、既存の行は変えない', async () => {
    const { sqlite, stub, ensure, rows } = setup();
    sqlite.prepare(
      'INSERT INTO digest_topics(userId,topicKey,name,description,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(USER_ID, 'genai', '自分の名前', '自分の説明', 5, 0, 1_000, 1_000);
    sqlite.prepare('UPDATE digest_topics SET embedding = ?, embeddedAt = ? WHERE topicKey = ?')
      .run(new Uint8Array(4096), 1_000, 'genai');

    expect(await ensure.run({ userId: USER_ID })).toEqual({ ok: true, val: { created: 6, embedded: 6 } });

    expect(rows().find((row) => row.topicKey === 'genai')).toEqual({
      topicKey: 'genai',
      name: '自分の名前',
      description: '自分の説明',
      sortOrder: 5,
      enabled: 0,
      embeddedAt: 1_000,
      bytes: 4096,
    });
    expect(stub.calls[0]?.texts).toHaveLength(6);
  });

  it('embedding が NULL の既存の topic だけを embed する', async () => {
    const { stub, ensure, build, rows } = setup({ textEmbedder: null });
    await ensure.run({ userId: USER_ID });
    expect(rows().every((row) => row.embeddedAt === null)).toBe(true);

    const result = await build(stub.embedder).run({ userId: USER_ID });

    expect(result).toEqual({ ok: true, val: { created: 0, embedded: 7 } });
    expect(rows().every((row) => row.embeddedAt === NOW && row.bytes === 4096)).toBe(true);
  });

  it('埋め込みに失敗しても topic は作ったままにして、embedded を 0 にする', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: TextEmbedder = {
      embed: () => RA.err({ type: 'AiError', message: 'boom' }),
    };
    const { ensure, rows } = setup({ textEmbedder: failing });

    expect(await ensure.run({ userId: USER_ID })).toEqual({ ok: true, val: { created: 7, embedded: 0 } });

    expect(rows()).toHaveLength(7);
    expect(rows().every((row) => row.embeddedAt === null)).toBe(true);
  });

  it('リゾルバーは sortOrder の順に、埋め込みを Float32Array にして返す', async () => {
    const { ensure, digestTopicsResolverByUserId } = setup();
    await ensure.run({ userId: USER_ID });

    const resolved = (await digestTopicsResolverByUserId.resolve(USER_ID)).val;

    expect(resolved.map((topic) => topic.topicKey)).toEqual(defaultDigestTopics.map((topic) => topic.topicKey));
    expect(resolved[0]!.embedding).toBeInstanceOf(Float32Array);
    expect(resolved[0]!.embedding).toHaveLength(1024);
    expect(resolved[0]!.embeddedAt).toBe(NOW);
  });

  it('作成と embed のイベントを domain_events に残し、embedding の中身はイベントに入れない', async () => {
    const { sqlite, ensure } = setup();
    await ensure.run({ userId: USER_ID });

    const events = sqlite.prepare(
      'SELECT eventName, length(eventPayload) AS size FROM domain_events WHERE aggregateName = \'digestTopic\'',
    ).all() as Array<{ eventName: string; size: number }>;

    expect(events.filter((event) => event.eventName === 'digestTopic.created')).toHaveLength(7);
    const embedded = events.filter((event) => event.eventName === 'digestTopic.embedded');
    expect(embedded).toHaveLength(7);
    expect(embedded.every((event) => event.size < 300)).toBe(true);
  });
});
