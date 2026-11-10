import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import {
  createD1BlueskyLoginFailureDeletedStore,
  createD1BlueskyLoginFailureResolver,
  createD1BlueskyLoginFailureSavedStore,
} from '../blueskyCrosspost/blueskyLoginFailureStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const at = (minutes: number) => Instant.orThrow(Date.UTC(2026, 10, 8, 0, minutes));

const setup = (scope = 'timeline') => {
  const { sqlite, db } = createSqliteD1Fixture();
  return {
    sqlite,
    resolver: createD1BlueskyLoginFailureResolver(db, scope),
    savedStore: createD1BlueskyLoginFailureSavedStore(db, scope),
    deletedStore: createD1BlueskyLoginFailureDeletedStore(db, scope),
  };
};

describe('bluesky_login_failures の migration', () => {
  it('scope を主キーとし、失敗の時刻の列を持つ', () => {
    const { sqlite } = setup();
    const columns = sqlite.prepare('PRAGMA table_info(bluesky_login_failures)').all() as Array<
      { name: string; pk: number }
    >;
    expect(columns.map(({ name, pk }) => [name, pk])).toEqual([['scope', 1], ['failedAt', 0]]);
  });
});

describe('BlueskyLoginFailure の D1 store', () => {
  it('記録が無ければ undefined を返す', async () => {
    const { resolver } = setup();
    expect(Result.unsafeUnwrap(await resolver.resolve())).toBeUndefined();
  });

  it('失敗の時刻を保存し、再び保存すると上書きする', async () => {
    const { resolver, savedStore, sqlite } = setup();

    await savedStore.save(at(1));
    expect(Result.unsafeUnwrap(await resolver.resolve())).toBe(at(1));
    await savedStore.save(at(40));

    expect(Result.unsafeUnwrap(await resolver.resolve())).toBe(at(40));
    expect(sqlite.prepare('SELECT scope FROM bluesky_login_failures').all()).toEqual([{ scope: 'timeline' }]);
  });

  it('記録を消す', async () => {
    const { resolver, savedStore, deletedStore } = setup();
    await savedStore.save(at(1));

    await deletedStore.delete();

    expect(Result.unsafeUnwrap(await resolver.resolve())).toBeUndefined();
  });
});
