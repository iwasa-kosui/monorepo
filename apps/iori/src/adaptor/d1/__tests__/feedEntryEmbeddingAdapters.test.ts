import { describe, expect, it } from 'vitest';

import { FeedEntry } from '../../../domain/feedEntry/feedEntry.ts';
import { FeedEntryId } from '../../../domain/feedEntry/feedEntryId.ts';
import { FeedSourceId } from '../../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { EMBEDDING_DIMENSIONS } from '../../../domain/interestSource/embedding.ts';
import { createD1FeedEntriesResolverByFeedSourceIdAndGuids } from '../feedEntry/feedEntriesResolverByFeedSourceIdAndGuids.ts';
import { createD1FeedEntriesResolverByFetchedSincePendingEmbedding } from '../feedEntry/feedEntriesResolverByFetchedSincePendingEmbedding.ts';
import { createD1FeedEntryEmbeddedStore } from '../feedEntry/feedEntryEmbeddedStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const HOUR_MS = 60 * 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 4, 12));

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const { sqlite, db } = fixture;
  sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
    .run('00000000-0000-4000-8000-0000000000f1', 'rss', 'https://feeds.example/a', 'feed', 1, 1_000);
  const addEntry = (n: number, fetchedAt: number, embeddedAt: number | null = null) => {
    const feedEntryId = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,fetchedAt,embeddedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      '00000000-0000-4000-8000-0000000000f1',
      `guid-${n}`,
      `https://example.com/${n}`,
      `title ${n}`,
      `description ${n}`,
      fetchedAt,
      embeddedAt,
    );
    return FeedEntryId.orThrow(feedEntryId);
  };
  const resolvePending = async (fetchedSince: number, limit = 100) => {
    const resolved = await createD1FeedEntriesResolverByFetchedSincePendingEmbedding(db).resolve({
      fetchedSince: Instant.orThrow(fetchedSince),
      limit,
    });
    return resolved.val;
  };
  return { fixture, sqlite, db, addEntry, resolvePending };
};

describe('feedEntry の embedded Store と pending Resolver', () => {
  it('pending は範囲内で未埋め込みの行を新しい順に返し、limit で切る', async () => {
    const { addEntry, resolvePending } = setup();
    const since = NOW - 48 * HOUR_MS;
    addEntry(1, since - 1);
    const oldest = addEntry(2, since);
    const newest = addEntry(3, NOW);
    addEntry(4, NOW, NOW);

    const pending = await resolvePending(since);

    expect(pending.map((entry) => entry.feedEntryId)).toEqual([newest, oldest]);
    expect(pending[0]).toMatchObject({ title: 'title 3', description: 'description 3', hatenaBookmarkCount: null });
    expect((await resolvePending(since, 1)).map((entry) => entry.feedEntryId)).toEqual([newest]);
    expect(pending[0]).not.toHaveProperty('embedding');
  });

  it('embedded は embedding と embeddedAt を書き、ベクトルをイベントに残さない', async () => {
    const { sqlite, db, addEntry, resolvePending } = setup();
    const feedEntryId = addEntry(1, NOW);
    const [entry] = await resolvePending(0);
    const embedding = Float32Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.cos(i) * 0.25);
    const event = FeedEntry.embed(entry!, embedding, NOW);
    if (!event.ok) throw new Error('unexpected');

    await createD1FeedEntryEmbeddedStore(db).store(event.val);

    expect(sqlite.prepare('SELECT length(embedding) AS bytes, embeddedAt FROM feed_entries').get()).toEqual({
      bytes: EMBEDDING_DIMENSIONS * 4,
      embeddedAt: NOW,
    });
    const events = sqlite.prepare('SELECT eventName, eventPayload, aggregateId FROM domain_events').all() as Array<
      { eventName: string; eventPayload: string; aggregateId: string }
    >;
    expect(events).toHaveLength(1);
    expect(events[0]?.eventName).toBe('feedEntry.embedded');
    expect(JSON.parse(events[0]!.eventPayload)).toEqual({ feedEntryId, embeddedAt: NOW });
    expect(await resolvePending(0)).toEqual([]);
  });

  it('embedded は複数のイベントを 1 回で書き、title と description を変えない', async () => {
    const { sqlite, db, addEntry, resolvePending } = setup();
    for (let n = 1; n <= 30; n += 1) addEntry(n, NOW);
    const entries = await resolvePending(0, 100);
    const events = entries.map((entry) => {
      const event = FeedEntry.embed(entry, new Float32Array(EMBEDDING_DIMENSIONS), NOW);
      if (!event.ok) throw new Error('unexpected');
      return event.val;
    });

    await createD1FeedEntryEmbeddedStore(db).store(...events);

    expect(sqlite.prepare('SELECT count(*) AS n FROM feed_entries WHERE embeddedAt IS NOT NULL').get()).toEqual({
      n: 30,
    });
    expect(sqlite.prepare('SELECT count(*) AS n FROM domain_events').get()).toEqual({ n: 30 });
    expect(sqlite.prepare('SELECT title, description FROM feed_entries WHERE guid = ?').get('guid-7')).toEqual({
      title: 'title 7',
      description: 'description 7',
    });
  });

  it('既存の feed entry の Resolver は embedding 列を読まずに復元できる', async () => {
    const { db, addEntry } = setup();
    const feedEntryId = addEntry(1, NOW, NOW);

    const resolved = await createD1FeedEntriesResolverByFeedSourceIdAndGuids(db).resolve({
      feedSourceId: FeedSourceId.orThrow('00000000-0000-4000-8000-0000000000f1'),
      guids: ['guid-1'],
    });

    expect(resolved.val.map((entry) => entry.feedEntryId)).toEqual([feedEntryId]);
    expect(resolved.val[0]).not.toHaveProperty('embedding');
    expect(resolved.val[0]).not.toHaveProperty('embeddedAt');
  });
});
