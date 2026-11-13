import { describe, expect, it } from 'vitest';

import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createBlueskyProfileRuntimePorts } from './blueskyProfile.ts';

const enabled = {
  IORI_BLUESKY_TIMELINE: 'enabled',
  BLUESKY_IDENTIFIER: 'kosui.me',
  BLUESKY_APP_PASSWORD: 'app-pass',
};

describe('createBlueskyProfileRuntimePorts', () => {
  it('Bluesky のタイムライン設定が無効なら、4 つのユースケースを undefined にする', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyProfileRuntimePorts(
      { IORI_BLUESKY_TIMELINE: 'disabled' } as unknown as IoriWorkerEnv,
      db,
    );

    expect(ports.getBlueskyProfileUseCase).toBeUndefined();
    expect(ports.listBlueskyAuthorFeedUseCase).toBeUndefined();
    expect(ports.followBlueskyActorUseCase).toBeUndefined();
    expect(ports.unfollowBlueskyActorUseCase).toBeUndefined();
    expect(ports.getOwnBlueskyProfileUseCase).toBeUndefined();
    expect(ports.updateBlueskyProfileUseCase).toBeUndefined();
    expect(ports.isDigestOwner).toBeTypeOf('function');
  });

  it('有効なら 4 つのユースケースを組み立てる', () => {
    const { db } = createSqliteD1Fixture();
    const ports = createBlueskyProfileRuntimePorts(enabled as unknown as IoriWorkerEnv, db);

    expect(ports.getBlueskyProfileUseCase?.run).toBeTypeOf('function');
    expect(ports.listBlueskyAuthorFeedUseCase?.run).toBeTypeOf('function');
    expect(ports.followBlueskyActorUseCase?.run).toBeTypeOf('function');
    expect(ports.unfollowBlueskyActorUseCase?.run).toBeTypeOf('function');
    expect(ports.getOwnBlueskyProfileUseCase?.run).toBeTypeOf('function');
    expect(ports.updateBlueskyProfileUseCase?.run).toBeTypeOf('function');
  });
});
