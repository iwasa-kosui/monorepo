import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import {
  InterestSource,
  type InterestSourceCreated,
  type InterestSourceKind,
} from '../../../domain/interestSource/interestSource.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { createD1InterestSourceContentChangedStore } from '../interestSource/interestSourceContentChangedStore.ts';
import { createD1InterestSourceCreatedStore } from '../interestSource/interestSourceCreatedStore.ts';
import { createD1InterestSourceDeletedStore } from '../interestSource/interestSourceDeletedStore.ts';
import { createD1InterestSourceEmbeddedStore } from '../interestSource/interestSourceEmbeddedStore.ts';
import { createD1InterestSourcesResolverByUserIdAndKind } from '../interestSource/interestSourcesResolverByUserIdAndKind.ts';
import { createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding } from '../interestSource/interestSourcesResolverByUserIdAndKindsPendingEmbedding.ts';
import { interestSourcesTable } from '../schema.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const now = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 30));
const later = Instant.orThrow(Date.UTC(2026, 10, 5, 21, 30));

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('me');
  const other = seed.addLocalActor('other');
  const db = fixture.db;
  const createEvent = (userId: string, kind: InterestSourceKind, ref: string, occurredAt: Instant = now) => {
    const created = InterestSource.create(
      { userId: userId as UserId, kind, ref, contentHash: 'a'.repeat(64), occurredAt },
      now,
    );
    if (!created.ok) throw new Error('unexpected');
    return created.val;
  };
  const seedSources = async (events: ReadonlyArray<InterestSourceCreated>) => {
    await createD1InterestSourceCreatedStore(db).store(...events);
    return events.map((event) => event.aggregateState);
  };
  const resolveByKind = async (userId: string, kind: InterestSourceKind) => {
    const resolved = await createD1InterestSourcesResolverByUserIdAndKind(db).resolve({
      userId: userId as UserId,
      kind,
    });
    if (!resolved.ok) throw new Error('unexpected');
    return resolved.val;
  };
  const eventNames = () =>
    (fixture.sqlite.prepare('SELECT eventName FROM domain_events ORDER BY rowid').all() as Array<
      { eventName: string }
    >).map((row) => row.eventName);
  return { fixture, db, me, other, createEvent, seedSources, resolveByKind, eventNames };
};

describe('interestSource の Store と Resolver', () => {
  it('created は 100 束縛を超える件数も行を分けて入れ、イベントを書く', async () => {
    const { fixture, me, createEvent, seedSources, resolveByKind, eventNames } = setup();
    const events = Array.from({ length: 20 }, (_, i) => createEvent(me.userId, 'own_like', `like-${i}`));

    await seedSources(events);

    expect(await resolveByKind(me.userId, 'own_like')).toHaveLength(20);
    expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM interest_sources WHERE embedding IS NULL').get()).toEqual({
      n: 20,
    });
    expect(eventNames()).toEqual(Array(20).fill('interestSource.created'));
  });

  it('created は空の呼び出しで何もしない', async () => {
    const { db, eventNames } = setup();

    await createD1InterestSourceCreatedStore(db).store();

    expect(eventNames()).toEqual([]);
  });

  it('同じ (userId, kind, ref) の created は一意制約で失敗し、1 件も入らない', async () => {
    const { me, createEvent, seedSources, resolveByKind } = setup();
    await seedSources([createEvent(me.userId, 'own_post', 'p-1')]);

    await expect(seedSources([createEvent(me.userId, 'own_post', 'p-2'), createEvent(me.userId, 'own_post', 'p-1')]))
      .rejects.toThrow();

    expect(await resolveByKind(me.userId, 'own_post')).toHaveLength(1);
  });

  it('ByUserIdAndKind は他人と他の kind と削除済みを返さず、ref、contentHash、embeddedAt を返す', async () => {
    const { db, me, other, createEvent, seedSources, resolveByKind } = setup();
    const [mine, gone] = await seedSources([
      createEvent(me.userId, 'kosui_post', 'https://example.com/a'),
      createEvent(me.userId, 'kosui_post', 'https://example.com/gone'),
      createEvent(me.userId, 'kosui_talk', 'https://example.com/talk'),
      createEvent(other.userId, 'kosui_post', 'https://example.com/a'),
    ]);
    await createD1InterestSourceDeletedStore(db).store(InterestSource.markDeleted(gone!, later));

    const resolved = await resolveByKind(me.userId, 'kosui_post');

    expect(resolved).toEqual([mine]);
    expect(resolved[0]).toMatchObject({ ref: 'https://example.com/a', contentHash: 'a'.repeat(64), embeddedAt: null });
  });

  it('deleted は deletedAt だけを入れてイベントを書く', async () => {
    const { fixture, db, me, createEvent, seedSources, eventNames } = setup();
    const [source] = await seedSources([createEvent(me.userId, 'own_post', 'p-1')]);

    await createD1InterestSourceDeletedStore(db).store(InterestSource.markDeleted(source!, later));

    expect(
      fixture.sqlite.prepare('SELECT deletedAt, updatedAt, contentHash FROM interest_sources').get(),
    ).toEqual({ deletedAt: later, updatedAt: now, contentHash: 'a'.repeat(64) });
    expect(eventNames()).toEqual(['interestSource.created', 'interestSource.deleted']);
  });

  it('embedded は embedding と embeddedAt を書き、ベクトルをイベントに残さない', async () => {
    const { fixture, db, me, createEvent, seedSources, resolveByKind, eventNames } = setup();
    const [source] = await seedSources([createEvent(me.userId, 'kosui_post', 'https://example.com/a')]);
    const embedding = Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.cos(i) * 0.25);
    const embedded = InterestSource.embed(source!, embedding, later);
    if (!embedded.ok) throw new Error('unexpected');

    await createD1InterestSourceEmbeddedStore(db).store(embedded.val);

    const [stored] = await db.select({
      embedding: interestSourcesTable.embedding,
      embeddedAt: interestSourcesTable.embeddedAt,
    })
      .from(interestSourcesTable);
    expect(stored?.embedding).toBeInstanceOf(Float32Array);
    expect(Array.from(stored!.embedding!)).toEqual(Array.from(embedding));
    expect(stored?.embeddedAt?.getTime()).toBe(later);
    expect((await resolveByKind(me.userId, 'kosui_post'))[0]?.embeddedAt).toBe(later);
    expect(eventNames()).toEqual(['interestSource.created', 'interestSource.embedded']);
    const row = fixture.sqlite.prepare(
      'SELECT eventPayload FROM domain_events WHERE eventName = \'interestSource.embedded\'',
    )
      .get() as { eventPayload: string };
    expect(JSON.parse(row.eventPayload)).toEqual({ interestSourceId: source!.interestSourceId, embeddedAt: later });
  });

  it('embedded は書き込みの前に contentHash が変わっていたら embedding と embeddedAt を書かない', async () => {
    const { fixture, db, me, createEvent, seedSources } = setup();
    const [source] = await seedSources([createEvent(me.userId, 'kosui_post', 'https://example.com/a')]);
    const embedded = InterestSource.embed(source!, new Float32Array(EMBEDDING_DIMENSIONS), later);
    if (!embedded.ok) throw new Error('unexpected');
    const changed = InterestSource.changeContent(source!, { contentHash: 'b'.repeat(64), occurredAt: later }, later);
    if (!changed.ok) throw new Error('unexpected');
    await createD1InterestSourceContentChangedStore(db).store(changed.val);

    await createD1InterestSourceEmbeddedStore(db).store(embedded.val);

    expect(
      fixture.sqlite.prepare('SELECT contentHash, embedding, embeddedAt FROM interest_sources').get(),
    ).toEqual({ contentHash: 'b'.repeat(64), embedding: null, embeddedAt: null });
  });

  it('embedded は削除済みの行に書かない', async () => {
    const { fixture, db, me, createEvent, seedSources } = setup();
    const [source] = await seedSources([createEvent(me.userId, 'kosui_post', 'https://example.com/a')]);
    const embedded = InterestSource.embed(source!, new Float32Array(EMBEDDING_DIMENSIONS), later);
    if (!embedded.ok) throw new Error('unexpected');
    await createD1InterestSourceDeletedStore(db).store(InterestSource.markDeleted(source!, now));

    await createD1InterestSourceEmbeddedStore(db).store(embedded.val);

    expect(
      fixture.sqlite.prepare('SELECT deletedAt, embedding, embeddedAt FROM interest_sources').get(),
    ).toEqual({ deletedAt: now, embedding: null, embeddedAt: null });
  });

  it('contentChanged は contentHash、occurredAt、updatedAt を更新し、embedding、embeddedAt、deletedAt を NULL に戻す', async () => {
    const { fixture, db, me, createEvent, seedSources } = setup();
    const [source] = await seedSources([createEvent(me.userId, 'kosui_post', 'https://example.com/a')]);
    const embedded = InterestSource.embed(source!, new Float32Array(EMBEDDING_DIMENSIONS), now);
    if (!embedded.ok) throw new Error('unexpected');
    await createD1InterestSourceEmbeddedStore(db).store(embedded.val);
    await createD1InterestSourceDeletedStore(db).store(InterestSource.markDeleted(embedded.val.aggregateState, now));
    const changed = InterestSource.changeContent(source!, { contentHash: 'b'.repeat(64), occurredAt: later }, later);
    if (!changed.ok) throw new Error('unexpected');

    await createD1InterestSourceContentChangedStore(db).store(changed.val);

    expect(
      fixture.sqlite.prepare(
        'SELECT contentHash, occurredAt, createdAt, updatedAt, embedding, embeddedAt, deletedAt FROM interest_sources',
      ).get(),
    ).toEqual({
      contentHash: 'b'.repeat(64),
      occurredAt: later,
      createdAt: now,
      updatedAt: later,
      embedding: null,
      embeddedAt: null,
      deletedAt: null,
    });
  });

  it('PendingEmbedding は未埋め込みかつ未削除の行を kind と件数で絞って返す', async () => {
    const { db, me, other, createEvent, seedSources } = setup();
    const sources = await seedSources([
      createEvent(me.userId, 'kosui_post', 'a'),
      createEvent(me.userId, 'kosui_post', 'b'),
      createEvent(me.userId, 'kosui_post', 'c'),
      createEvent(me.userId, 'kosui_post', 'd'),
      createEvent(me.userId, 'kosui_talk', 'e'),
      createEvent(me.userId, 'own_like', 'f'),
      createEvent(other.userId, 'kosui_post', 'g'),
    ]);
    const embedded = InterestSource.embed(sources[0]!, new Float32Array(EMBEDDING_DIMENSIONS), later);
    if (!embedded.ok) throw new Error('unexpected');
    await createD1InterestSourceEmbeddedStore(db).store(embedded.val);
    await createD1InterestSourceDeletedStore(db).store(InterestSource.markDeleted(sources[1]!, later));
    const resolver = createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding(db);

    const pending = await resolver.resolve({
      userId: me.userId as UserId,
      kinds: ['kosui_post', 'kosui_talk'],
      limit: 10,
    });
    const limited = await resolver.resolve({
      userId: me.userId as UserId,
      kinds: ['kosui_post', 'kosui_talk'],
      limit: 1,
    });
    const none = await resolver.resolve({ userId: me.userId as UserId, kinds: [], limit: 10 });

    if (!pending.ok || !limited.ok || !none.ok) throw new Error('unexpected');
    expect(pending.val.map((source) => source.ref).sort()).toEqual(['c', 'd', 'e']);
    expect(limited.val).toHaveLength(1);
    expect(none.val).toEqual([]);
  });
});
