import { describe, expect, it } from 'vitest';

import { FeedSourceId } from '../../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1FeedEntriesResolverByFetchedBefore } from '../feedEntry/feedEntriesResolverByFetchedBefore.ts';
import { createD1FeedEntryMaxGuidResolverByFeedSourceId } from '../feedEntry/feedEntryMaxGuidResolverByFeedSourceId.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  let counter = 1000;
  const addFeedSource = (kind: string) => {
    const feedSourceId = uuid(++counter);
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(feedSourceId, kind, `https://feeds.example/${feedSourceId}`, kind, 1, 1_000);
    return FeedSourceId.orThrow(feedSourceId);
  };
  const addEntry = (feedSourceId: string, guid: string, publishedAt = 10_000) => {
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(uuid(++counter), feedSourceId, guid, `https://example.com/${guid}`, guid, guid, publishedAt, publishedAt);
  };
  return { addFeedSource, addEntry, db };
};

describe('createD1FeedEntryMaxGuidResolverByFeedSourceId', () => {
  it('桁数が違う数値の guid でも数値として最大のものを返す', async () => {
    const { addFeedSource, addEntry, db } = setup();
    const source = addFeedSource('x_user');
    for (const guid of ['99', '100', '1000000000000000001', '1000000000000000000', '9999']) addEntry(source, guid);

    expect((await createD1FeedEntryMaxGuidResolverByFeedSourceId(db).resolve(source)).val).toBe(
      '1000000000000000001',
    );
  });

  it('他の情報源の guid を見ず、記事がなければ undefined を返す', async () => {
    const { addFeedSource, addEntry, db } = setup();
    const source = addFeedSource('x_user');
    const other = addFeedSource('x_user');
    addEntry(other, '5000');

    const resolver = createD1FeedEntryMaxGuidResolverByFeedSourceId(db);

    expect((await resolver.resolve(source)).val).toBeUndefined();
    expect((await resolver.resolve(other)).val).toBe('5000');
  });
});

describe('createD1FeedEntriesResolverByFetchedBefore', () => {
  const guidsOf = async (
    db: ReturnType<typeof setup>['db'],
    options: Parameters<ReturnType<typeof createD1FeedEntriesResolverByFetchedBefore>['resolve']>[0],
  ) => (await createD1FeedEntriesResolverByFetchedBefore(db).resolve(options)).val.map((entry) => entry.guid).sort();

  const seeded = () => {
    const t = setup();
    for (const kind of ['rss', 'x_user', 'thoughtworks_radar']) t.addEntry(t.addFeedSource(kind), kind);
    return t;
  };

  it('kinds を渡すと、その kind の情報源の記事だけを返す', async () => {
    const { db } = seeded();
    expect(await guidsOf(db, { fetchedBefore: Instant.orThrow(20_000), limit: 10, kinds: ['x_user'] })).toEqual([
      'x_user',
    ]);
  });

  it('excludedKinds を渡すと、その kind の情報源の記事を除く', async () => {
    const { db } = seeded();
    expect(
      await guidsOf(db, {
        fetchedBefore: Instant.orThrow(20_000),
        limit: 10,
        excludedKinds: ['thoughtworks_radar', 'x_user'],
      }),
    ).toEqual(['rss']);
  });

  it('kinds が空なら何も返さない', async () => {
    const { db } = seeded();
    expect(await guidsOf(db, { fetchedBefore: Instant.orThrow(20_000), limit: 10, kinds: [] })).toEqual([]);
  });

  it('fetchedBefore より新しい記事は返さない', async () => {
    const { db } = seeded();
    expect(await guidsOf(db, { fetchedBefore: Instant.orThrow(10_000), limit: 10, kinds: ['x_user'] })).toEqual([]);
  });
});
