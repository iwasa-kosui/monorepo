import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import {
  createD1BlueskySyncFailedStore,
  createD1BlueskySyncStatusResolver,
  createD1BlueskySyncSucceededStore,
} from '../blueskySyncStatus/blueskySyncStatusStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const at = (minutes: number) => Instant.orThrow(Date.UTC(2026, 10, 12, 0, minutes));

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  return {
    sqlite,
    resolver: createD1BlueskySyncStatusResolver(db),
    succeededStore: createD1BlueskySyncSucceededStore(db),
    failedStore: createD1BlueskySyncFailedStore(db),
  };
};

describe('bluesky_sync_status の migration', () => {
  it('scope を主キーとし、ほかの列は null を許す', () => {
    const { sqlite } = setup();
    const columns = sqlite.prepare('PRAGMA table_info(bluesky_sync_status)').all() as Array<
      { name: string; pk: number; notnull: number }
    >;
    expect(columns.map(({ name, pk, notnull }) => [name, pk, notnull])).toEqual([
      ['scope', 1, 1],
      ['lastSucceededAt', 0, 0],
      ['lastFailedAt', 0, 0],
      ['lastFailureKind', 0, 0],
      ['lastFailureCode', 0, 0],
    ]);
  });
});

describe('BlueskySyncStatus の D1 store', () => {
  it('記録が無ければ空の配列を返す', async () => {
    const { resolver } = setup();
    expect(Result.unsafeUnwrap(await resolver.resolve())).toEqual([]);
  });

  it('成功の時刻を保存し、再び保存すると上書きする', async () => {
    const { resolver, succeededStore, sqlite } = setup();

    await succeededStore.save('timeline', at(1));
    await succeededStore.save('timeline', at(2));

    expect(Result.unsafeUnwrap(await resolver.resolve())).toEqual([
      {
        scope: 'timeline',
        lastSucceededAt: at(2),
        lastFailedAt: null,
        lastFailureKind: null,
        lastFailureCode: null,
      },
    ]);
    expect(sqlite.prepare('SELECT scope FROM bluesky_sync_status').all()).toEqual([{ scope: 'timeline' }]);
  });

  it('失敗の保存は成功の列を変えない', async () => {
    const { resolver, succeededStore, failedStore } = setup();
    await succeededStore.save('timeline', at(1));

    await failedStore.save('timeline', at(5), 'http', 'UpstreamFailure');

    expect(Result.unsafeUnwrap(await resolver.resolve())).toEqual([
      {
        scope: 'timeline',
        lastSucceededAt: at(1),
        lastFailedAt: at(5),
        lastFailureKind: 'http',
        lastFailureCode: 'UpstreamFailure',
      },
    ]);
  });

  it('成功の保存は失敗の列を変えない', async () => {
    const { resolver, succeededStore, failedStore } = setup();
    await failedStore.save('timeline', at(5), 'auth', null);

    await succeededStore.save('timeline', at(9));

    expect(Result.unsafeUnwrap(await resolver.resolve())).toEqual([
      {
        scope: 'timeline',
        lastSucceededAt: at(9),
        lastFailedAt: at(5),
        lastFailureKind: 'auth',
        lastFailureCode: null,
      },
    ]);
  });

  it('scope ごとに別の行として保存する', async () => {
    const { resolver, succeededStore, failedStore } = setup();

    await succeededStore.save('timeline', at(1));
    await failedStore.save('notifications', at(2), 'network', null);

    const records = Result.unsafeUnwrap(await resolver.resolve());
    expect(records.find((record) => record.scope === 'timeline')?.lastFailedAt).toBeNull();
    expect(records.find((record) => record.scope === 'notifications')).toEqual({
      scope: 'notifications',
      lastSucceededAt: null,
      lastFailedAt: at(2),
      lastFailureKind: 'network',
      lastFailureCode: null,
    });
  });
});
