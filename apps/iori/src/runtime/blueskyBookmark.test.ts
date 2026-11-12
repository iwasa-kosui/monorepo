import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createBlueskyBookmarkRuntimePorts } from './blueskyBookmark.ts';

const enabled = {
  IORI_BLUESKY_TIMELINE: 'enabled',
  BLUESKY_IDENTIFIER: 'kosui.me',
  BLUESKY_APP_PASSWORD: 'app-pass',
};

describe('createBlueskyBookmarkRuntimePorts', () => {
  it('Bluesky のタイムライン設定が無効なら、3 つのユースケースを undefined にする', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyBookmarkRuntimePorts(
      { IORI_BLUESKY_TIMELINE: 'disabled' } as unknown as IoriWorkerEnv,
      db,
    );

    expect(ports.bookmarkBlueskyPostUseCase).toBeUndefined();
    expect(ports.unbookmarkBlueskyPostUseCase).toBeUndefined();
    expect(ports.listBlueskyBookmarksUseCase).toBeUndefined();
    expect(ports.viewerDid).toBeUndefined();
    expect(ports.isDigestOwner).toBeTypeOf('function');
  });

  it('有効なら 3 つのユースケースを組み立てる', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyBookmarkRuntimePorts(enabled as unknown as IoriWorkerEnv, db);

    expect(ports.bookmarkBlueskyPostUseCase?.run).toBeTypeOf('function');
    expect(ports.unbookmarkBlueskyPostUseCase?.run).toBeTypeOf('function');
    expect(ports.listBlueskyBookmarksUseCase?.run).toBeTypeOf('function');
    expect(ports.viewerDid).toBeTypeOf('function');
  });
});
