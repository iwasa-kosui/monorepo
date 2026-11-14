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

describe('BlueskySyncStatus の D1 store', () => {
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
});
