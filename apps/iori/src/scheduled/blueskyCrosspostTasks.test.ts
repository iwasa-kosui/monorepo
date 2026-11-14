import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IoriWorkerEnv } from '../workerEnv.ts';
import { retryBlueskyCrosspostsTask } from './blueskyCrosspostTasks.ts';
import { type ScheduledTaskContext } from './scheduledTasks.ts';

const untouchable = (name: string) =>
  new Proxy({}, {
    get: () => {
      throw new Error(`${name} must not be touched`);
    },
  });

const contextWith = (env: Partial<IoriWorkerEnv>): ScheduledTaskContext => ({
  env: { DB: untouchable('DB'), UPLOADS: untouchable('UPLOADS'), ...env } as never,
  scheduledTime: new Date('2026-01-01T00:00:00Z'),
  waitUntil: () => undefined,
});

afterEach(() => vi.restoreAllMocks());

describe('retryBlueskyCrosspostsTask', () => {
  it.each([
    [{}],
    [{ IORI_BLUESKY_CROSSPOST: 'disabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_CROSSPOST: 'ENABLED', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: 'id' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: '', BLUESKY_APP_PASSWORD: 'pw' }],
    [{ IORI_BLUESKY_CROSSPOST: 'enabled', BLUESKY_IDENTIFIER: 'id', BLUESKY_APP_PASSWORD: ' ' }],
  ])('無効な設定 %j のときは、DB にも R2 にも触れず、無効であることをログに出す', async (env) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await retryBlueskyCrosspostsTask.run(contextWith(env));

    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori bluesky crosspost is disabled.');
  });
});
