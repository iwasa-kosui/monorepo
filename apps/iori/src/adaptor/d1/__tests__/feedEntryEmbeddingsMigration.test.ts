import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixture.sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
    .run('source-1', 'rss', 'https://feeds.example/a', 'feed', 1, 1_000);
  const insertEntry = (feedEntryId: string, embedding: Uint8Array | null = null, embeddedAt: number | null = null) =>
    fixture.sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,hatenaBookmarkCount,fetchedAt,embedding,embeddedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      'source-1',
      feedEntryId,
      `https://example.com/${feedEntryId}`,
      't',
      'd',
      null,
      null,
      2_000,
      embedding,
      embeddedAt,
    );
  return { fixture, insertEntry };
};

describe('feed_entries の embedding 列の migration', () => {
  it('embedding と embeddedAt を省いて insert でき、NULL になる', () => {
    const { fixture } = setup();
    fixture.sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,fetchedAt) VALUES (?,?,?,?,?,?,?)',
    ).run('e-1', 'source-1', 'g', 'https://example.com/a', 't', 'd', 2_000);

    expect(fixture.sqlite.prepare('SELECT feedEntryId, embedding, embeddedAt FROM feed_entries').all()).toEqual([
      { feedEntryId: 'e-1', embedding: null, embeddedAt: null },
    ]);
  });

  it('4096 バイトの BLOB をそのまま読み戻せる', () => {
    const { fixture, insertEntry } = setup();
    const bytes = Uint8Array.from({ length: 4096 }, (_, index) => index % 256);
    insertEntry('e-1', bytes, 3_000);

    const [row] = fixture.sqlite.prepare('SELECT embedding, embeddedAt FROM feed_entries').all() as Array<
      { embedding: Uint8Array; embeddedAt: number }
    >;

    expect(Array.from(row!.embedding)).toEqual(Array.from(bytes));
    expect(row?.embeddedAt).toBe(3_000);
  });

  it('未埋め込みの行を fetchedAt の範囲で引く索引がある', () => {
    const { fixture } = setup();

    const plan = fixture.sqlite.prepare(
      'EXPLAIN QUERY PLAN SELECT feedEntryId FROM feed_entries WHERE embeddedAt IS NULL AND fetchedAt >= 1000 ORDER BY fetchedAt DESC',
    ).all() as Array<{ detail: string }>;

    expect(plan.map((row) => row.detail).join('\n')).toContain('feed_entries_embedded_at_fetched_at_idx');
  });
});
