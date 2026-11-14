import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPruneFederatedPostsTask } from './federatedPostTasks.ts';
import { type ScheduledTaskContext } from './scheduledTasks.ts';

const contextWith = (value: string | undefined): ScheduledTaskContext => ({
  env: { IORI_PRUNE_FEDERATED_POSTS: value } as never,
  scheduledTime: new Date('2026-01-01T00:00:00Z'),
  waitUntil: () => undefined,
});

afterEach(() => vi.restoreAllMocks());

describe('pruneFederatedPostsTask', () => {
  it.each([undefined, '', 'disabled', 'true', '1', 'ENABLED'])(
    '環境変数が %j のときは、use case を呼ばず、無効であることをログに出す',
    async (value) => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const run = vi.fn(async () => RA.ok({ pruned: 0 }));
      const task = createPruneFederatedPostsTask(() => ({ run }));

      await task.run(contextWith(value));

      expect(run).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledOnce();
      expect(info).toHaveBeenCalledWith('iori federated posts pruning is disabled.');
    },
  );

  it('環境変数が enabled のときは、use case を呼び、削除件数をログに出す', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const run = vi.fn(async () => RA.ok({ pruned: 3 }));
    const task = createPruneFederatedPostsTask(() => ({ run }));

    await task.run(contextWith('enabled'));

    expect(run).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith('iori federated posts pruned.', { pruned: 3 });
  });
});
