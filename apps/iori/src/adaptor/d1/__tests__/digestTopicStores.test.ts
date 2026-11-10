import { describe, expect, it } from 'vitest';

import { DigestTopic } from '../../../domain/digestTopic/digestTopic.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestTopicCreatedStore } from '../digestTopic/digestTopicCreatedStore.ts';
import { createD1DigestTopicEditedStore } from '../digestTopic/digestTopicEditedStore.ts';
import { createD1DigestTopicEmbeddedStore } from '../digestTopic/digestTopicEmbeddedStore.ts';
import { createD1DigestTopicEnabledChangedStore } from '../digestTopic/digestTopicEnabledChangedStore.ts';
import { createD1DigestTopicMaterialWindowChangedStore } from '../digestTopic/digestTopicMaterialWindowChangedStore.ts';
import { createD1DigestTopicsResolverByUserId } from '../digestTopic/digestTopicsResolverByUserId.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const CREATED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 0));
const EMBEDDED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 3));
const EDITED_AT = Instant.orThrow(Date.UTC(2026, 10, 5, 6));
const USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const OTHER_USER_ID = UserId.orThrow('00000000-0000-4000-8000-000000000002');

const vector = (offset = 0) => Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i + offset) / 1024);

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(USER_ID, 'kosui');
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(OTHER_USER_ID, 'other');
  const createTopic = (
    topicKey: string,
    options: { userId?: UserId; name?: string; description?: string; sortOrder?: number } = {},
  ) => {
    const created = DigestTopic.create({
      userId: options.userId ?? USER_ID,
      topicKey,
      name: options.name ?? `${topicKey} の名前`,
      description: options.description ?? `${topicKey} の説明`,
      sortOrder: options.sortOrder ?? 0,
    }, CREATED_AT);
    if (!created.ok) throw new Error('unexpected');
    return created.val;
  };
  const embedTopic = (topic: DigestTopic, embedding: Float32Array) => {
    const embedded = DigestTopic.embed(topic, { embedding, excludeEmbedding: null }, EMBEDDED_AT);
    if (!embedded.ok) throw new Error('unexpected');
    return embedded.val;
  };
  const editTopic = (topic: DigestTopic, name: string, description: string) => {
    const edited = DigestTopic.edit(topic, { name, description }, EDITED_AT);
    if (!edited.ok) throw new Error('unexpected');
    return edited.val;
  };
  const setTopicEnabled = (topic: DigestTopic, enabled: boolean) => {
    const changed = DigestTopic.setEnabled(topic, enabled, EDITED_AT);
    if (!changed.ok) throw new Error('unexpected');
    return changed.val;
  };
  const setTopicMaterialWindowHours = (topic: DigestTopic, materialWindowHours: number | null) => {
    const changed = DigestTopic.setMaterialWindowHours(topic, materialWindowHours, EDITED_AT);
    if (!changed.ok) throw new Error('unexpected');
    return changed.val;
  };
  const topicRows = () =>
    sqlite.prepare(
      'SELECT topicKey, description, embeddedAt, updatedAt, length(embedding) AS bytes FROM digest_topics ORDER BY topicKey',
    ).all();
  const eventNames = () =>
    (sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateName = \'digestTopic\' ORDER BY eventName')
      .all() as Array<{ eventName: string }>).map((row) => row.eventName);
  return {
    sqlite,
    db,
    createTopic,
    embedTopic,
    editTopic,
    setTopicEnabled,
    setTopicMaterialWindowHours,
    topicRows,
    eventNames,
    createdStore: createD1DigestTopicCreatedStore(db),
    embeddedStore: createD1DigestTopicEmbeddedStore(db),
    editedStore: createD1DigestTopicEditedStore(db),
    enabledChangedStore: createD1DigestTopicEnabledChangedStore(db),
    materialWindowChangedStore: createD1DigestTopicMaterialWindowChangedStore(db),
    resolver: createD1DigestTopicsResolverByUserId(db),
  };
};

describe('createD1DigestTopicCreatedStore', () => {
  it('topic を embedding なしで書き、digestTopic.created を domain_events に残す', async () => {
    const { createdStore, createTopic, topicRows, eventNames } = setup();

    await createdStore.store(createTopic('genai'), createTopic('platform'));

    expect(topicRows()).toEqual([
      { topicKey: 'genai', description: 'genai の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
      { topicKey: 'platform', description: 'platform の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
    ]);
    expect(eventNames()).toEqual(['digestTopic.created', 'digestTopic.created']);
  });

  it('同じ (userId, topicKey) をもう一度書いても失敗せず、先に書いた行を変えない', async () => {
    const { createdStore, createTopic, topicRows } = setup();
    await createdStore.store(createTopic('genai', { description: '先に書いた説明' }));

    await expect(createdStore.store(createTopic('genai', { description: '後から書いた説明' }), createTopic('server')))
      .resolves.toEqual({ ok: true, val: undefined });

    expect(topicRows()).toEqual([
      { topicKey: 'genai', description: '先に書いた説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
      { topicKey: 'server', description: 'server の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
    ]);
  });

  it('同じ topicKey でも、別のユーザーの行は別に書く', async () => {
    const { createdStore, createTopic, topicRows } = setup();

    await createdStore.store(createTopic('genai'), createTopic('genai', { userId: OTHER_USER_ID }));

    expect(topicRows()).toHaveLength(2);
  });

  it('同じ eventId の domain event があっても失敗しない', async () => {
    const { createdStore, createTopic, eventNames } = setup();
    const created = createTopic('genai');

    await createdStore.store(created);
    await expect(createdStore.store(created)).resolves.toEqual({ ok: true, val: undefined });

    expect(eventNames()).toEqual(['digestTopic.created']);
  });
});

describe('createD1DigestTopicEmbeddedStore', () => {
  it('embedding の BLOB を書き、リゾルバーが同じ値の Float32Array で読み戻す', async () => {
    const { createdStore, embeddedStore, resolver, createTopic, embedTopic, topicRows } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await embeddedStore.store(embedTopic(created.aggregateState, vector()));

    expect(topicRows()).toEqual([
      {
        topicKey: 'genai',
        description: 'genai の説明',
        embeddedAt: EMBEDDED_AT,
        updatedAt: EMBEDDED_AT,
        bytes: EMBEDDING_DIMENSIONS * 4,
      },
    ]);
    const [stored] = (await resolver.resolve(USER_ID)).val;
    expect(stored?.embedding).toBeInstanceOf(Float32Array);
    expect(Array.from(stored!.embedding!)).toEqual(Array.from(vector()));
    expect(stored?.embeddedAt).toBe(EMBEDDED_AT);
  });

  it('digestTopic.embedded を embedding の中身なしで domain_events に残す', async () => {
    const { sqlite, createdStore, embeddedStore, createTopic, embedTopic } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await embeddedStore.store(embedTopic(created.aggregateState, vector()));

    const events = sqlite.prepare(
      'SELECT eventName, eventPayload FROM domain_events WHERE eventName = \'digestTopic.embedded\'',
    ).all() as Array<{ eventName: string; eventPayload: string }>;
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.eventPayload)).toEqual({
      userId: USER_ID,
      topicKey: 'genai',
      embeddedAt: EMBEDDED_AT,
    });
  });

  it('description が一致しない topic は更新せず、イベントも書かない', async () => {
    const { createdStore, embeddedStore, resolver, createTopic, embedTopic, topicRows, eventNames } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await embeddedStore.store(embedTopic({ ...created.aggregateState, description: '古い説明' }, vector()));

    expect(topicRows()).toEqual([
      { topicKey: 'genai', description: 'genai の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
    ]);
    expect((await resolver.resolve(USER_ID)).val[0]?.embedding).toBeNull();
    expect(eventNames()).toEqual(['digestTopic.created']);
  });

  it('name が一致しない topic は更新せず、イベントも書かない', async () => {
    const { createdStore, embeddedStore, resolver, createTopic, embedTopic, topicRows, eventNames } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await embeddedStore.store(embedTopic({ ...created.aggregateState, name: '古い名前' }, vector()));

    expect(topicRows()).toEqual([
      { topicKey: 'genai', description: 'genai の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
    ]);
    expect((await resolver.resolve(USER_ID)).val[0]?.embedding).toBeNull();
    expect(eventNames()).toEqual(['digestTopic.created']);
  });

  it('名前だけを編集した後に、編集前の名前の埋め込みを書こうとしても、古い埋め込みを書かない', async () => {
    const { createdStore, editedStore, embeddedStore, createTopic, embedTopic, editTopic, topicRows, eventNames } =
      setup();
    const created = createTopic('genai');
    await createdStore.store(created);
    await editedStore.store(editTopic(created.aggregateState, '新しい名前', created.aggregateState.description));

    await embeddedStore.store(embedTopic(created.aggregateState, vector()));

    expect(topicRows()).toEqual([
      { topicKey: 'genai', description: 'genai の説明', embeddedAt: null, updatedAt: EDITED_AT, bytes: null },
    ]);
    expect(eventNames()).toEqual(['digestTopic.created', 'digestTopic.edited']);
  });

  it('一致する topic の分だけ更新してイベントを書き、一致しない topic は何も変えない', async () => {
    const { createdStore, embeddedStore, createTopic, embedTopic, topicRows, eventNames } = setup();
    const matching = createTopic('genai');
    const stale = createTopic('platform');
    await createdStore.store(matching, stale);

    await embeddedStore.store(
      embedTopic(matching.aggregateState, vector()),
      embedTopic({ ...stale.aggregateState, description: '古い説明' }, vector(1)),
    );

    expect(topicRows()).toEqual([
      {
        topicKey: 'genai',
        description: 'genai の説明',
        embeddedAt: EMBEDDED_AT,
        updatedAt: EMBEDDED_AT,
        bytes: EMBEDDING_DIMENSIONS * 4,
      },
      { topicKey: 'platform', description: 'platform の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
    ]);
    expect(eventNames()).toEqual(['digestTopic.created', 'digestTopic.created', 'digestTopic.embedded']);
  });

  it('存在しない topic には何も書かない', async () => {
    const { embeddedStore, createTopic, embedTopic, topicRows, eventNames } = setup();

    await embeddedStore.store(embedTopic(createTopic('genai').aggregateState, vector()));

    expect(topicRows()).toEqual([]);
    expect(eventNames()).toEqual([]);
  });
});

describe('createD1DigestTopicEditedStore', () => {
  it('name、description、updatedAt を更新し、embedding と embeddedAt を NULL に戻す', async () => {
    const { sqlite, createdStore, embeddedStore, editedStore, createTopic, embedTopic, editTopic } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);
    await embeddedStore.store(embedTopic(created.aggregateState, vector()));

    await editedStore.store(editTopic(created.aggregateState, '新しい名前', '新しい説明'));

    expect(
      sqlite.prepare(
        'SELECT name, description, enabled, sortOrder, embeddedAt, updatedAt, createdAt, length(embedding) AS bytes FROM digest_topics',
      ).all(),
    ).toEqual([
      {
        name: '新しい名前',
        description: '新しい説明',
        enabled: 1,
        sortOrder: 0,
        embeddedAt: null,
        updatedAt: EDITED_AT,
        createdAt: CREATED_AT,
        bytes: null,
      },
    ]);
  });

  it('他のユーザーの同じ topicKey の行と、同じユーザーの他の topicKey の行は変えない', async () => {
    const { createdStore, editedStore, createTopic, editTopic, topicRows } = setup();
    const target = createTopic('genai');
    await createdStore.store(target, createTopic('genai', { userId: OTHER_USER_ID }), createTopic('platform'));

    await editedStore.store(editTopic(target.aggregateState, '新しい名前', '新しい説明'));

    expect(topicRows()).toEqual([
      { topicKey: 'genai', description: '新しい説明', embeddedAt: null, updatedAt: EDITED_AT, bytes: null },
      { topicKey: 'genai', description: 'genai の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
      { topicKey: 'platform', description: 'platform の説明', embeddedAt: null, updatedAt: CREATED_AT, bytes: null },
    ]);
  });

  it('digestTopic.edited を name と description 付きで domain_events に残す', async () => {
    const { sqlite, createdStore, editedStore, createTopic, editTopic } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await editedStore.store(editTopic(created.aggregateState, '新しい名前', '新しい説明'));

    const events = sqlite.prepare(
      'SELECT eventPayload FROM domain_events WHERE eventName = \'digestTopic.edited\'',
    ).all() as Array<{ eventPayload: string }>;
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.eventPayload)).toEqual({
      userId: USER_ID,
      topicKey: 'genai',
      name: '新しい名前',
      description: '新しい説明',
      examples: [],
      excludes: [],
      updatedAt: EDITED_AT,
    });
  });
});

describe('テーマの examples、excludes、excludeEmbedding の保存', () => {
  const columns = (sqlite: ReturnType<typeof setup>['sqlite']) =>
    sqlite.prepare(
      'SELECT examples, excludes, length(embedding) AS bytes, length(excludeEmbedding) AS excludeBytes FROM digest_topics',
    ).all();

  it('作成時に examples と excludes を JSON で書き、embedded で excludeEmbedding も書く', async () => {
    const { sqlite, createdStore, embeddedStore, resolver } = setup();
    const created = DigestTopic.create({
      userId: USER_ID,
      topicKey: 'genai',
      name: '名前',
      description: '説明',
      sortOrder: 0,
      examples: ['例'],
      excludes: ['除く'],
    }, CREATED_AT);
    if (!created.ok) throw new Error('unexpected');
    await createdStore.store(created.val);
    expect(columns(sqlite)).toEqual([
      { examples: '["例"]', excludes: '["除く"]', bytes: null, excludeBytes: null },
    ]);

    const embedded = DigestTopic.embed(
      created.val.aggregateState,
      { embedding: vector(), excludeEmbedding: vector(1) },
      EMBEDDED_AT,
    );
    if (!embedded.ok) throw new Error('unexpected');
    await embeddedStore.store(embedded.val);

    expect(columns(sqlite)).toEqual([
      {
        examples: '["例"]',
        excludes: '["除く"]',
        bytes: EMBEDDING_DIMENSIONS * 4,
        excludeBytes: EMBEDDING_DIMENSIONS * 4,
      },
    ]);
    const [stored] = (await resolver.resolve(USER_ID)).val;
    expect(stored).toMatchObject({ examples: ['例'], excludes: ['除く'] });
    expect(stored?.excludeEmbedding?.[1]).toBeCloseTo(1 / 1024 * 2, 6);
  });

  it('embedded の元になった examples が今の値と違えば、何も書かない', async () => {
    const { sqlite, createdStore, embeddedStore, createTopic, embedTopic } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await embeddedStore.store(embedTopic({ ...created.aggregateState, examples: ['古い例'] }, vector()));

    expect(columns(sqlite)).toEqual([{ examples: '[]', excludes: '[]', bytes: null, excludeBytes: null }]);
  });

  it('編集で examples と excludes を書き換え、embedding と excludeEmbedding を消す', async () => {
    const { sqlite, createdStore, embeddedStore, editedStore, createTopic } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);
    const embedded = DigestTopic.embed(
      created.aggregateState,
      { embedding: vector(), excludeEmbedding: vector(1) },
      EMBEDDED_AT,
    );
    if (!embedded.ok) throw new Error('unexpected');
    await embeddedStore.store(embedded.val);

    const edited = DigestTopic.edit(
      embedded.val.aggregateState,
      { name: '名前', description: '説明', examples: ['新しい例'], excludes: ['新しい除く'] },
      EDITED_AT,
    );
    if (!edited.ok) throw new Error('unexpected');
    await editedStore.store(edited.val);

    expect(columns(sqlite)).toEqual([
      { examples: '["新しい例"]', excludes: '["新しい除く"]', bytes: null, excludeBytes: null },
    ]);
  });
});

describe('createD1DigestTopicEnabledChangedStore', () => {
  it('enabled と updatedAt だけを更新し、embedding は残す', async () => {
    const { sqlite, createdStore, embeddedStore, enabledChangedStore, createTopic, embedTopic, setTopicEnabled } =
      setup();
    const created = createTopic('genai');
    await createdStore.store(created);
    await embeddedStore.store(embedTopic(created.aggregateState, vector()));

    await enabledChangedStore.store(setTopicEnabled(created.aggregateState, false));

    expect(
      sqlite.prepare('SELECT name, enabled, embeddedAt, updatedAt, length(embedding) AS bytes FROM digest_topics')
        .all(),
    ).toEqual([
      {
        name: 'genai の名前',
        enabled: 0,
        embeddedAt: EMBEDDED_AT,
        updatedAt: EDITED_AT,
        bytes: EMBEDDING_DIMENSIONS * 4,
      },
    ]);
  });

  it('他のユーザーの同じ topicKey の行は変えない', async () => {
    const { sqlite, createdStore, enabledChangedStore, createTopic, setTopicEnabled } = setup();
    const target = createTopic('genai');
    await createdStore.store(target, createTopic('genai', { userId: OTHER_USER_ID }));

    await enabledChangedStore.store(setTopicEnabled(target.aggregateState, false));

    expect(sqlite.prepare('SELECT userId, enabled FROM digest_topics ORDER BY userId').all()).toEqual([
      { userId: USER_ID, enabled: 0 },
      { userId: OTHER_USER_ID, enabled: 1 },
    ]);
  });

  it('digestTopic.enabledChanged を domain_events に残す', async () => {
    const { sqlite, createdStore, enabledChangedStore, createTopic, setTopicEnabled } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await enabledChangedStore.store(setTopicEnabled(created.aggregateState, false));

    const events = sqlite.prepare(
      'SELECT eventPayload FROM domain_events WHERE eventName = \'digestTopic.enabledChanged\'',
    ).all() as Array<{ eventPayload: string }>;
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.eventPayload)).toEqual({
      userId: USER_ID,
      topicKey: 'genai',
      enabled: false,
      updatedAt: EDITED_AT,
    });
  });
});

describe('createD1DigestTopicMaterialWindowChangedStore', () => {
  it('materialWindowHours と updatedAt だけを更新し、embedding は残す', async () => {
    const {
      sqlite,
      createdStore,
      embeddedStore,
      materialWindowChangedStore,
      createTopic,
      embedTopic,
      setTopicMaterialWindowHours,
    } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);
    await embeddedStore.store(embedTopic(created.aggregateState, vector()));

    await materialWindowChangedStore.store(setTopicMaterialWindowHours(created.aggregateState, 72));

    expect(
      sqlite.prepare(
        'SELECT name, enabled, materialWindowHours, embeddedAt, updatedAt, length(embedding) AS bytes FROM digest_topics',
      ).all(),
    ).toEqual([
      {
        name: 'genai の名前',
        enabled: 1,
        materialWindowHours: 72,
        embeddedAt: EMBEDDED_AT,
        updatedAt: EDITED_AT,
        bytes: EMBEDDING_DIMENSIONS * 4,
      },
    ]);
  });

  it('null で materialWindowHours を NULL に戻す', async () => {
    const { sqlite, createdStore, materialWindowChangedStore, createTopic, setTopicMaterialWindowHours } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);
    const withWindow = setTopicMaterialWindowHours(created.aggregateState, 72);
    await materialWindowChangedStore.store(withWindow);

    await materialWindowChangedStore.store(setTopicMaterialWindowHours(withWindow.aggregateState, null));

    expect(sqlite.prepare('SELECT materialWindowHours FROM digest_topics').all()).toEqual([
      { materialWindowHours: null },
    ]);
  });

  it('他のユーザーの同じ topicKey の行は変えない', async () => {
    const { sqlite, createdStore, materialWindowChangedStore, createTopic, setTopicMaterialWindowHours } = setup();
    const target = createTopic('genai');
    await createdStore.store(target, createTopic('genai', { userId: OTHER_USER_ID }));

    await materialWindowChangedStore.store(setTopicMaterialWindowHours(target.aggregateState, 72));

    expect(sqlite.prepare('SELECT userId, materialWindowHours FROM digest_topics ORDER BY userId').all()).toEqual([
      { userId: USER_ID, materialWindowHours: 72 },
      { userId: OTHER_USER_ID, materialWindowHours: null },
    ]);
  });

  it('digestTopic.materialWindowChanged を domain_events に残す', async () => {
    const { sqlite, createdStore, materialWindowChangedStore, createTopic, setTopicMaterialWindowHours } = setup();
    const created = createTopic('genai');
    await createdStore.store(created);

    await materialWindowChangedStore.store(setTopicMaterialWindowHours(created.aggregateState, 72));

    const events = sqlite.prepare(
      'SELECT eventPayload FROM domain_events WHERE eventName = \'digestTopic.materialWindowChanged\'',
    ).all() as Array<{ eventPayload: string }>;
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.eventPayload)).toEqual({
      userId: USER_ID,
      topicKey: 'genai',
      materialWindowHours: 72,
      updatedAt: EDITED_AT,
    });
  });
});

describe('createD1DigestTopicsResolverByUserId', () => {
  it('指定したユーザーの topic だけを sortOrder、topicKey の順に返す', async () => {
    const { createdStore, resolver, createTopic } = setup();
    await createdStore.store(
      createTopic('server', { sortOrder: 2 }),
      createTopic('platform', { sortOrder: 1 }),
      createTopic('design', { sortOrder: 2 }),
      createTopic('genai', { userId: OTHER_USER_ID, sortOrder: 0 }),
    );

    const resolved = (await resolver.resolve(USER_ID)).val;

    expect(resolved.map((topic) => topic.topicKey)).toEqual(['platform', 'design', 'server']);
  });

  it('embedding が無ければ null、あれば Float32Array にし、日時と enabled を domain の型に戻す', async () => {
    const { createdStore, embeddedStore, resolver, createTopic, embedTopic } = setup();
    const embedded = createTopic('genai');
    await createdStore.store(embedded, createTopic('platform', { sortOrder: 1 }));
    await embeddedStore.store(embedTopic(embedded.aggregateState, vector()));

    const [genai, platform] = (await resolver.resolve(USER_ID)).val;

    expect(genai).toMatchObject({
      userId: USER_ID,
      topicKey: 'genai',
      name: 'genai の名前',
      description: 'genai の説明',
      embeddedAt: EMBEDDED_AT,
      sortOrder: 0,
      enabled: true,
      createdAt: CREATED_AT,
      updatedAt: EMBEDDED_AT,
    });
    expect(genai?.embedding).toBeInstanceOf(Float32Array);
    expect(platform).toMatchObject({ topicKey: 'platform', embedding: null, embeddedAt: null });
  });

  it('materialWindowHours は新規作成では null で、store で書いた値を読み戻す', async () => {
    const { createdStore, materialWindowChangedStore, resolver, createTopic, setTopicMaterialWindowHours } = setup();
    const created = createTopic('genai');
    await createdStore.store(created, createTopic('platform', { sortOrder: 1 }));
    expect((await resolver.resolve(USER_ID)).val.map((topic) => topic.materialWindowHours)).toEqual([null, null]);

    await materialWindowChangedStore.store(setTopicMaterialWindowHours(created.aggregateState, 336));

    expect((await resolver.resolve(USER_ID)).val.map((topic) => topic.materialWindowHours)).toEqual([336, null]);
  });

  it('topic が無ければ空の配列を返す', async () => {
    const { resolver } = setup();

    expect(await resolver.resolve(USER_ID)).toEqual({ ok: true, val: [] });
  });
});
