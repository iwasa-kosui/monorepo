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
import { AddDigestTopicUseCase } from '../addDigestTopic.ts';
import { INTEREST_EMBEDDING_MODEL } from '../helper/embedInterestSources.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 12));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const OTHER_USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000002');

const setup = (options: { textEmbedder?: TextEmbedder | null } = {}) => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(OTHER_USER_ID, 'other');
  const stub = createStubEmbedder(1024);
  const add = AddDigestTopicUseCase.create({
    digestTopicsResolverByUserId: createD1DigestTopicsResolverByUserId(db),
    digestTopicCreatedStore: createD1DigestTopicCreatedStore(db),
    digestTopicEmbeddedStore: createD1DigestTopicEmbeddedStore(db),
    textEmbedder: options.textEmbedder === null ? undefined : options.textEmbedder ?? stub.embedder,
    now: () => NOW,
  });
  const seedTopic = (userId: UserId, topicKey: string, sortOrder: number) =>
    sqlite.prepare(
      'INSERT INTO digest_topics(userId,topicKey,name,description,sortOrder,enabled,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(userId, topicKey, `${topicKey} の名前`, `${topicKey} の説明`, sortOrder, 1, 1_000, 1_000);
  const rows = () =>
    sqlite.prepare(
      'SELECT userId, topicKey, name, description, sortOrder, enabled, embeddedAt, length(embedding) AS bytes FROM digest_topics ORDER BY userId, sortOrder',
    ).all();
  return { sqlite, stub, add, seedTopic, rows };
};

afterEach(() => vi.restoreAllMocks());

describe('AddDigestTopic', () => {
  it('custom- で始まる topicKey をサーバ側で作り、有効なトピックとして保存して embed して返す', async () => {
    const { stub, add, rows } = setup();

    const result = await add.run({ userId: USER_ID, name: '新しい名前', description: '新しい説明' });

    expect(result).toMatchObject({
      ok: true,
      val: { name: '新しい名前', description: '新しい説明', enabled: true, sortOrder: 0, embeddedAt: NOW },
    });
    expect(result.ok && result.val.topicKey).toMatch(/^custom-[0-9a-f]{8}$/);
    expect(result.ok && result.val.embedding?.length).toBe(1024);
    expect(stub.calls).toEqual([{ model: INTEREST_EMBEDDING_MODEL, texts: ['新しい名前: 新しい説明'] }]);
    expect(rows()).toEqual([
      {
        userId: USER_ID,
        topicKey: result.ok ? result.val.topicKey : '',
        name: '新しい名前',
        description: '新しい説明',
        sortOrder: 0,
        enabled: 1,
        embeddedAt: NOW,
        bytes: 4096,
      },
    ]);
  });

  it('既定の topicKey と衝突せず、追加のたびに別の topicKey になる', async () => {
    const { add } = setup();

    const first = await add.run({ userId: USER_ID, name: 'A', description: 'a' });
    const second = await add.run({ userId: USER_ID, name: 'B', description: 'b' });

    const keys = [first, second].map((result) => result.ok ? result.val.topicKey : '');
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((key) => !defaultDigestTopics.some((topic) => topic.topicKey === key))).toBe(true);
  });

  it('sortOrder は本人の既存の最大値 + 1 にして、他のユーザーの値は見ない', async () => {
    const { seedTopic, add } = setup();
    seedTopic(USER_ID, 'genai', 2);
    seedTopic(USER_ID, 'platform', 6);
    seedTopic(OTHER_USER_ID, 'genai', 40);

    const result = await add.run({ userId: USER_ID, name: '新しい名前', description: '新しい説明' });

    expect(result).toMatchObject({ ok: true, val: { sortOrder: 7 } });
  });

  it('不正な name は検証エラーにして、何も保存しない', async () => {
    const { stub, add, rows } = setup();

    const result = await add.run({ userId: USER_ID, name: '', description: '説明' });

    expect(result).toMatchObject({ ok: false, err: { kind: 'ParseError' } });
    expect(stub.calls).toHaveLength(0);
    expect(rows()).toEqual([]);
  });

  it('埋め込みに失敗しても追加は成功として返し、embedding は NULL のまま console.error を出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: TextEmbedder = { embed: () => RA.err({ type: 'AiError', message: 'boom' }) };
    const { add, rows } = setup({ textEmbedder: failing });

    const result = await add.run({ userId: USER_ID, name: '新しい名前', description: '新しい説明' });

    expect(result).toMatchObject({ ok: true, val: { embedding: null, embeddedAt: null } });
    expect(rows()).toHaveLength(1);
    expect(error).toHaveBeenCalled();
  });

  it('textEmbedder が無ければ console.error を出し、追加は成功として返す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { add, rows } = setup({ textEmbedder: null });

    const result = await add.run({ userId: USER_ID, name: '新しい名前', description: '新しい説明' });

    expect(result).toMatchObject({ ok: true, val: { embedding: null } });
    expect(rows()).toHaveLength(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
