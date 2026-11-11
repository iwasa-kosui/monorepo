import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createD1BlueskyMutedActorsSyncedStore } from '../blueskyTimeline/blueskyMutedActorsSyncedStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = (initial: readonly string[] = []) => {
  const { sqlite, db, queries } = createSqliteD1Fixture();
  const insert = sqlite.prepare('INSERT INTO bluesky_muted_actors(did) VALUES (?)');
  for (const did of initial) insert.run(did);
  const store = createD1BlueskyMutedActorsSyncedStore(db);
  return {
    queries,
    sync: async (dids: readonly string[]) => Result.unsafeUnwrap(await store.sync(dids)),
    stored: () =>
      (sqlite.prepare('SELECT did FROM bluesky_muted_actors ORDER BY did').all() as Array<{ did: string }>).map((
        row,
      ) => row.did),
  };
};

describe('D1 の bluesky_muted_actors の同期', () => {
  it('取得した DID を加え、取得できなかった DID を消す', async () => {
    const t = setup(['did:plc:a', 'did:plc:b']);

    const result = await t.sync(['did:plc:b', 'did:plc:c', 'did:plc:c']);

    expect(result).toEqual({ added: 1, removed: 1 });
    expect(t.stored()).toEqual(['did:plc:b', 'did:plc:c']);
  });

  it('ミュートが変わらないときは SELECT 1 本だけで書き込まない', async () => {
    const t = setup(['did:plc:a']);
    t.queries.length = 0;

    expect(await t.sync(['did:plc:a'])).toEqual({ added: 0, removed: 0 });
    expect(t.queries.map(({ sql }) => sql.trim().split(/\s+/)[0]!.toLowerCase())).toEqual(['select']);
  });

  it('D1 のバインドの上限を超えないよう、多数の DID を分けて書く', async () => {
    const t = setup();
    const dids = Array.from({ length: 230 }, (_, index) => `did:plc:${String(index).padStart(3, '0')}`);

    expect(await t.sync(dids)).toEqual({ added: 230, removed: 0 });
    expect(t.stored()).toHaveLength(230);
    expect(await t.sync([])).toEqual({ added: 0, removed: 230 });
    expect(t.stored()).toEqual([]);
  });
});
