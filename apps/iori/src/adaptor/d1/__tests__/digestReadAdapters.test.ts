import { describe, expect, it } from 'vitest';

import { DigestSubscription } from '../../../domain/digestSubscription/digestSubscription.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { float32ToBytes } from '../../../domain/interestSource/embeddingBytes.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom } from '../digest/digestTopicItemsResolverByUserIdAndDigestDateFrom.ts';
import { createD1DigestSubscriptionResolverByUserId } from '../digestSubscription/digestSubscriptionResolverByUserId.ts';
import { createD1DigestSubscriptionSavedStore } from '../digestSubscription/digestSubscriptionSavedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('me');
  const addDigest = (
    owner: { userId: string },
    digestDate: string,
    options: { topicKey?: string; itemCount?: number; legacy?: boolean } = {},
  ) => {
    const digestId = crypto.randomUUID();
    fixture.sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,postId,createdAt,topicKey) VALUES (?,?,?,?,?,?,?)',
    ).run(
      digestId,
      owner.userId,
      digestDate,
      options.legacy ? crypto.randomUUID() : null,
      options.legacy ? null : crypto.randomUUID(),
      2_000,
      options.topicKey ?? 'summary',
    );
    for (const rank of [3, 1, 2].filter((candidate) => candidate <= (options.itemCount ?? 3))) {
      fixture.sqlite.prepare(
        'INSERT INTO digest_items(digestItemId,digestId,feedEntryId,url,title,rank) VALUES (?,?,?,?,?,?)',
      ).run(crypto.randomUUID(), digestId, `entry-${rank}`, `https://example.com/${rank}`, `T${rank}`, rank);
    }
    return { digestId };
  };
  return { fixture, db: fixture.db, me, addDigest };
};

const valueOf = <T>(result: { ok: boolean; val?: T }): T => {
  if (!result.ok) throw new Error('unexpected');
  return result.val as T;
};

describe('createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom', () => {
  const embeddingOf = (...head: number[]) =>
    Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => head[i] ?? 0);
  const addEntry = (fixture: ReturnType<typeof setup>['fixture'], feedEntryId: string, embedding: Float32Array) => {
    fixture.sqlite.prepare(
      'INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)',
    )
      .run('source', 'rss', 'https://feeds.example/rss', 'rss', 1, 1_000);
    fixture.sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      'source',
      feedEntryId,
      `https://example.com/${feedEntryId}`,
      feedEntryId,
      '',
      null,
      1_000,
      float32ToBytes(embedding),
      2_000,
    );
  };
  const resolve = async (
    db: ReturnType<typeof setup>['db'],
    userId: string,
    digestDateFrom: string,
    limit = 1_000,
  ) =>
    valueOf(
      await createD1DigestTopicItemsResolverByUserIdAndDigestDateFrom(db).resolve({
        userId: userId as UserId,
        digestDateFrom,
        limit,
      }),
    );

  it('指定日以降の summary 以外のダイジェスト項目を、新しい日付順とトピック順と rank 順で、記事の embedding つきで返す', async () => {
    const { fixture, db, me, addDigest } = setup();
    addEntry(fixture, 'entry-1', embeddingOf(1, 2));
    addDigest(me, '2026-11-04', { topicKey: 'genai', itemCount: 1 });
    addDigest(me, '2026-11-05', { topicKey: 'platform', itemCount: 2 });
    addDigest(me, '2026-11-05', { topicKey: 'genai', itemCount: 1 });
    addDigest(me, '2026-11-05', { itemCount: 2 });
    addDigest(me, '2026-11-03', { topicKey: 'genai', itemCount: 1 });

    const items = await resolve(db, me.userId, '2026-11-04');

    expect(items.map((item) => `${item.digestDate}:${item.topicKey}:${item.rank}`)).toEqual([
      '2026-11-05:genai:1',
      '2026-11-05:platform:1',
      '2026-11-05:platform:2',
      '2026-11-04:genai:1',
    ]);
    expect(items[0]).toMatchObject({ title: 'T1', url: 'https://example.com/1' });
    expect(items[0]!.embedding).toEqual(embeddingOf(1, 2));
  });

  it('記事が消えているか embedding の次元が違う項目は、embedding を null にする', async () => {
    const { fixture, db, me, addDigest } = setup();
    addEntry(fixture, 'entry-2', embeddingOf(1).slice(0, 8));
    addDigest(me, '2026-11-05', { topicKey: 'genai', itemCount: 2 });

    const items = await resolve(db, me.userId, '2026-11-05');

    expect(items.map((item) => [item.rank, item.embedding])).toEqual([[1, null], [2, null]]);
  });

  it('limit を渡すと、並び順の先頭からその件数だけ返す', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-04', { topicKey: 'genai', itemCount: 2 });
    addDigest(me, '2026-11-05', { topicKey: 'genai', itemCount: 2 });

    const items = await resolve(db, me.userId, '2026-11-01', 3);

    expect(items.map((item) => `${item.digestDate}:${item.rank}`)).toEqual([
      '2026-11-05:1',
      '2026-11-05:2',
      '2026-11-04:1',
    ]);
  });

  it('postId が NULL の旧 digest の項目は返さない', async () => {
    const { db, me, addDigest } = setup();
    addDigest(me, '2026-11-05', { topicKey: 'genai', itemCount: 1, legacy: true });
    addDigest(me, '2026-11-05', { topicKey: 'platform', itemCount: 1 });

    const items = await resolve(db, me.userId, '2026-11-01');

    expect(items.map((item) => item.topicKey)).toEqual(['platform']);
  });
});

describe('createD1DigestSubscriptionSavedStore', () => {
  it('userId で upsert し、createdAt を保って enabled と updatedAt を更新し、domain event を書く', async () => {
    const { fixture, db, me } = setup();
    const userId = me.userId as UserId;
    const store = createD1DigestSubscriptionSavedStore(db);
    const first = DigestSubscription.save({ userId, enabled: false }, undefined, Instant.orThrow(1_000));
    await store.store(first);
    const second = DigestSubscription.save({ userId, enabled: true }, first.aggregateState, Instant.orThrow(5_000));
    await store.store(second);

    const stored = valueOf(await createD1DigestSubscriptionResolverByUserId(db).resolve(userId));

    expect(stored).toEqual({ userId, enabled: true, createdAt: 1_000, updatedAt: 5_000 });
    expect(fixture.sqlite.prepare('SELECT eventName FROM domain_events').all()).toEqual([
      { eventName: 'digestSubscription.saved' },
      { eventName: 'digestSubscription.saved' },
    ]);
  });
});
