import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { createD1BlueskyTimelineItemsResolver } from '../blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const BASE = Date.UTC(2026, 10, 8, 12);

const setup = (rows: ReadonlyArray<Readonly<{ feedItemId: string; indexedAt: number }>>) => {
  const { sqlite, db } = createSqliteD1Fixture();
  const insert = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
  );
  for (const row of rows) {
    insert.run(
      row.feedItemId,
      row.feedItemId,
      'cid',
      'did:plc:a',
      'alice.bsky.social',
      'text',
      '[]',
      1,
      row.indexedAt,
      1,
    );
  }
  const resolver = createD1BlueskyTimelineItemsResolver(db);
  return {
    resolve: async (input: { limit: number; before?: number; beforeId?: string }) =>
      Result.unsafeUnwrap(
        await resolver.resolve({
          limit: input.limit,
          before: input.before === undefined ? undefined : Instant.orThrow(input.before),
          beforeId: input.beforeId,
        }),
      ).map((item) => item.feedItemId),
  };
};

describe('D1 の bluesky_timeline_items リゾルバー', () => {
  const rows = [
    { feedItemId: 'a', indexedAt: BASE },
    { feedItemId: 'b', indexedAt: BASE },
    { feedItemId: 'c', indexedAt: BASE },
    { feedItemId: 'd', indexedAt: BASE },
    { feedItemId: 'e', indexedAt: BASE - 1000 },
  ];

  it('indexedAt の降順、同じ値なら feedItemId の降順で返す', async () => {
    const t = setup(rows);

    expect(await t.resolve({ limit: 10 })).toEqual(['d', 'c', 'b', 'a', 'e']);
  });

  it('beforeId が無いときは indexedAt が before より小さい行だけを返す', async () => {
    const t = setup(rows);

    expect(await t.resolve({ limit: 10, before: BASE })).toEqual(['e']);
  });

  it('同じ ms の行がページ境界をまたいでも、(indexedAt, feedItemId) のカーソルで抜けずに続きを取る', async () => {
    const t = setup(rows);

    const first = await t.resolve({ limit: 2 });
    const second = await t.resolve({ limit: 2, before: BASE, beforeId: first.at(-1) });
    const third = await t.resolve({ limit: 2, before: BASE, beforeId: second.at(-1) });

    expect(first).toEqual(['d', 'c']);
    expect(second).toEqual(['b', 'a']);
    expect(third).toEqual(['e']);
  });
});
