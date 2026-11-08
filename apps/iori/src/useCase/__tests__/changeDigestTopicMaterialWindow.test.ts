import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1DigestTopicCreatedStore } from '../../adaptor/d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../../adaptor/d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicMaterialWindowChangedStore } from '../../adaptor/d1/digestTopic/digestTopicMaterialWindowChangedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../../adaptor/d1/digestTopic/digestTopicsResolverByUserId.ts';
import { DigestTopic } from '../../domain/digestTopic/digestTopic.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import { ChangeDigestTopicMaterialWindowUseCase } from '../changeDigestTopicMaterialWindow.ts';

const CREATED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 0));
const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 12));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const OTHER_USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000002');

const setup = async () => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(OTHER_USER_ID, 'other');
  const change = ChangeDigestTopicMaterialWindowUseCase.create({
    digestTopicsResolverByUserId: createD1DigestTopicsResolverByUserId(db),
    digestTopicMaterialWindowChangedStore: createD1DigestTopicMaterialWindowChangedStore(db),
    now: () => NOW,
  });
  for (const userId of [USER_ID, OTHER_USER_ID]) {
    const created = DigestTopic.create({
      userId,
      topicKey: 'genai',
      name: '名前',
      description: '説明',
      sortOrder: 0,
    }, CREATED_AT);
    if (!created.ok) throw new Error('unexpected');
    await createD1DigestTopicCreatedStore(db).store(created.val);
    const embedded = DigestTopic.embed(created.val.aggregateState, {
      embedding: new Float32Array(1024),
      excludeEmbedding: null,
    }, CREATED_AT);
    if (!embedded.ok) throw new Error('unexpected');
    await createD1DigestTopicEmbeddedStore(db).store(embedded.val);
  }
  const eventNames = () =>
    (sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'digestTopic\' ORDER BY rowid')
      .all() as Array<{ eventName: string }>).map((row) => row.eventName);
  return { sqlite, change, eventNames };
};

describe('ChangeDigestTopicMaterialWindow', () => {
  it('materialWindowHours を設定して、embedding を残したまま更新後のトピックを返す', async () => {
    const { sqlite, change } = await setup();

    const result = await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: 72 });

    expect(result).toMatchObject({
      ok: true,
      val: { topicKey: 'genai', materialWindowHours: 72, enabled: true, updatedAt: NOW },
    });
    expect(result.ok && result.val.embedding?.length).toBe(1024);
    expect(sqlite.prepare('SELECT userId, materialWindowHours FROM digest_topics ORDER BY userId').all()).toEqual([
      { userId: USER_ID, materialWindowHours: 72 },
      { userId: OTHER_USER_ID, materialWindowHours: null },
    ]);
  });

  it('null で期間を解除できる', async () => {
    const { change } = await setup();
    await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: 72 });

    const result = await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: null });

    expect(result).toMatchObject({ ok: true, val: { materialWindowHours: null } });
  });

  it('digestTopic.materialWindowChanged のイベントを残す', async () => {
    const { change, eventNames } = await setup();
    const before = eventNames().length;

    await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: 72 });

    expect(eventNames().slice(before)).toEqual(['digestTopic.materialWindowChanged']);
  });

  it('今と同じ値なら、何も書かずにトピックを返す', async () => {
    const { change, eventNames } = await setup();
    await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: 72 });
    const before = eventNames().length;

    const result = await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: 72 });

    expect(result).toMatchObject({ ok: true, val: { materialWindowHours: 72, updatedAt: NOW } });
    expect(eventNames()).toHaveLength(before);
  });

  it('未設定のまま null を指定しても、何も書かずにトピックを返す', async () => {
    const { change, eventNames } = await setup();
    const before = eventNames().length;

    const result = await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: null });

    expect(result).toMatchObject({ ok: true, val: { materialWindowHours: null, updatedAt: CREATED_AT } });
    expect(eventNames()).toHaveLength(before);
  });

  it('範囲外の値は DigestTopicParseError にして、何も書かない', async () => {
    const { sqlite, change, eventNames } = await setup();
    const before = eventNames().length;

    const result = await change.run({ userId: USER_ID, topicKey: 'genai', materialWindowHours: 337 });

    expect(result.ok).toBe(false);
    expect(sqlite.prepare('SELECT materialWindowHours FROM digest_topics').all()).toEqual([
      { materialWindowHours: null },
      { materialWindowHours: null },
    ]);
    expect(eventNames()).toHaveLength(before);
  });

  it('トピックが無ければ DigestTopicNotFoundError にする', async () => {
    const { change } = await setup();

    const result = await change.run({ userId: USER_ID, topicKey: 'missing', materialWindowHours: 72 });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'DigestTopicNotFoundError', detail: { topicKey: 'missing' } },
    });
  });
});
