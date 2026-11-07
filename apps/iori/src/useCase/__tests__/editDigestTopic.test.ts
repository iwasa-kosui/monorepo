import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1DigestTopicCreatedStore } from '../../adaptor/d1/digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEditedStore } from '../../adaptor/d1/digestTopic/digestTopicEditedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../../adaptor/d1/digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../../adaptor/d1/digestTopic/digestTopicsResolverByUserId.ts';
import { DigestTopic } from '../../domain/digestTopic/digestTopic.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import { createStubEmbedder } from '../../testing/aiStubs.ts';
import { EditDigestTopicUseCase } from '../editDigestTopic.ts';
import { INTEREST_EMBEDDING_MODEL } from '../helper/embedInterestSources.ts';

const CREATED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 0));
const NOW = Instant.orThrow(Date.UTC(2026, 10, 5, 12));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const OTHER_USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000002');

const setup = async (options: { textEmbedder?: TextEmbedder | null } = {}) => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(OTHER_USER_ID, 'other');
  const stub = createStubEmbedder(1024);
  const digestTopicsResolverByUserId = createD1DigestTopicsResolverByUserId(db);
  const textEmbedder = options.textEmbedder === null ? undefined : options.textEmbedder ?? stub.embedder;
  const edit = EditDigestTopicUseCase.create({
    digestTopicsResolverByUserId,
    digestTopicEditedStore: createD1DigestTopicEditedStore(db),
    digestTopicEmbeddedStore: createD1DigestTopicEmbeddedStore(db),
    textEmbedder,
    now: () => NOW,
  });
  const seed = async (userId: UserId, topicKey: string) => {
    const created = DigestTopic.create({
      userId,
      topicKey,
      name: '元の名前',
      description: '元の説明',
      sortOrder: 3,
    }, CREATED_AT);
    if (!created.ok) throw new Error('unexpected');
    await createD1DigestTopicCreatedStore(db).store(created.val);
    const embedded = DigestTopic.embed(created.val.aggregateState, new Float32Array(1024), CREATED_AT);
    if (!embedded.ok) throw new Error('unexpected');
    await createD1DigestTopicEmbeddedStore(db).store(embedded.val);
  };
  await seed(USER_ID, 'genai');
  await seed(OTHER_USER_ID, 'genai');
  const rows = () =>
    sqlite.prepare(
      'SELECT userId, name, description, enabled, sortOrder, embeddedAt, updatedAt, length(embedding) AS bytes FROM digest_topics ORDER BY userId',
    ).all();
  const eventNames = () =>
    (sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'digestTopic\' ORDER BY rowid')
      .all() as Array<{ eventName: string }>).map((row) => row.eventName);
  return { sqlite, stub, edit, rows, eventNames };
};

afterEach(() => vi.restoreAllMocks());

describe('EditDigestTopic', () => {
  it('name と description を変え、そのトピックだけを「name: description」で embed し直して返す', async () => {
    const { stub, edit, rows } = await setup();

    const result = await edit.run({
      userId: USER_ID,
      topicKey: 'genai',
      name: '新しい名前',
      description: '新しい説明',
    });

    expect(result).toMatchObject({
      ok: true,
      val: { topicKey: 'genai', name: '新しい名前', description: '新しい説明', embeddedAt: NOW, sortOrder: 3 },
    });
    expect(result.ok && result.val.embedding?.length).toBe(1024);
    expect(stub.calls).toEqual([{ model: INTEREST_EMBEDDING_MODEL, texts: ['新しい名前: 新しい説明'] }]);
    expect(rows()[0]).toMatchObject({ name: '新しい名前', description: '新しい説明', embeddedAt: NOW, bytes: 4096 });
  });

  it('name だけを渡したら description はそのままにして embed し直す', async () => {
    const { stub, edit } = await setup();

    const result = await edit.run({ userId: USER_ID, topicKey: 'genai', name: '新しい名前' });

    expect(result).toMatchObject({ ok: true, val: { name: '新しい名前', description: '元の説明' } });
    expect(stub.calls[0]?.texts).toEqual(['新しい名前: 元の説明']);
  });

  it('他のユーザーの同じ topicKey の行は変えない', async () => {
    const { edit, rows } = await setup();

    await edit.run({ userId: USER_ID, topicKey: 'genai', name: '新しい名前' });

    expect(rows()[1]).toMatchObject({ userId: OTHER_USER_ID, name: '元の名前', embeddedAt: CREATED_AT, bytes: 4096 });
  });

  it('digestTopic.edited と digestTopic.embedded のイベントを残す', async () => {
    const { edit, eventNames } = await setup();
    const before = eventNames().length;

    await edit.run({ userId: USER_ID, topicKey: 'genai', name: '新しい名前' });

    expect(eventNames().slice(before)).toEqual(['digestTopic.edited', 'digestTopic.embedded']);
  });

  it('変わらない値だけなら、何も書かず embed もしない', async () => {
    const { stub, edit, eventNames } = await setup();
    const before = eventNames().length;

    const result = await edit.run({ userId: USER_ID, topicKey: 'genai', name: '元の名前', description: '元の説明' });

    expect(result).toMatchObject({ ok: true, val: { name: '元の名前', embeddedAt: CREATED_AT } });
    expect(stub.calls).toHaveLength(0);
    expect(eventNames()).toHaveLength(before);
  });

  it('トピックが無ければ DigestTopicNotFoundError にして、何も書かない', async () => {
    const { stub, edit, rows } = await setup();

    const result = await edit.run({ userId: USER_ID, topicKey: 'missing', name: '新しい名前' });

    expect(result).toMatchObject({
      ok: false,
      err: { type: 'DigestTopicNotFoundError', detail: { topicKey: 'missing' } },
    });
    expect(stub.calls).toHaveLength(0);
    expect(rows()[0]).toMatchObject({ name: '元の名前' });
  });

  it('他のユーザーだけが持つトピックは DigestTopicNotFoundError にする', async () => {
    const { sqlite, edit } = await setup();
    sqlite.prepare('DELETE FROM digest_topics WHERE userId = ?').run(USER_ID);

    const result = await edit.run({ userId: USER_ID, topicKey: 'genai', name: '新しい名前' });

    expect(result).toMatchObject({ ok: false, err: { type: 'DigestTopicNotFoundError' } });
  });

  it('不正な name は検証エラーにして、何も書かない', async () => {
    const { stub, edit, rows } = await setup();

    const result = await edit.run({ userId: USER_ID, topicKey: 'genai', name: 'あ'.repeat(41) });

    expect(result).toMatchObject({ ok: false, err: { kind: 'ParseError' } });
    expect(stub.calls).toHaveLength(0);
    expect(rows()[0]).toMatchObject({ name: '元の名前', embeddedAt: CREATED_AT });
  });

  it('埋め込みに失敗しても編集は成功として返し、embedding は NULL のまま console.error を出す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: TextEmbedder = { embed: () => RA.err({ type: 'AiError', message: 'boom' }) };
    const { edit, rows } = await setup({ textEmbedder: failing });

    const result = await edit.run({ userId: USER_ID, topicKey: 'genai', name: '新しい名前' });

    expect(result).toMatchObject({ ok: true, val: { name: '新しい名前', embedding: null, embeddedAt: null } });
    expect(rows()[0]).toMatchObject({ name: '新しい名前', embeddedAt: null, bytes: null });
    expect(error).toHaveBeenCalled();
  });

  it('textEmbedder が無ければ console.error を出し、編集は成功として返す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { edit, rows } = await setup({ textEmbedder: null });

    const result = await edit.run({ userId: USER_ID, topicKey: 'genai', description: '新しい説明' });

    expect(result).toMatchObject({ ok: true, val: { description: '新しい説明', embedding: null } });
    expect(rows()[0]).toMatchObject({ description: '新しい説明', embeddedAt: null, bytes: null });
    expect(error).toHaveBeenCalledTimes(1);
  });
});
