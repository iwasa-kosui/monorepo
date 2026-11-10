import { describe, expect, it } from 'vitest';

import { settleAll } from '../../../helper/settleAll.ts';
import { ControlledQueue, type QueueStorage } from './controlledQueue.ts';

const deferred = () => Promise.withResolvers<void>();
const fixture = () => {
  const events: string[] = [];
  const rows = [{ id: 'one', message: { test: true }, due: true }];
  const storage: QueueStorage = {
    initialize: async () => {},
    enqueue: async () => {},
    enqueueMany: async () => {},
    depth: async () => rows.length,
    transaction: async (handler) => {
      events.push('BEGIN');
      let deleted = false;
      try {
        await handler({
          take: async () => {
            events.push('SELECT');
            return rows.find((row) => row.due);
          },
          remove: async () => {
            events.push('DELETE');
            deleted = true;
          },
        });
        events.push('COMMIT');
        if (deleted) rows.shift();
      } catch (error) {
        events.push('ROLLBACK');
        throw error;
      }
    },
  };
  return { events, rows, queue: new ControlledQueue(storage, 1) };
};
describe('controlled queue', () => {
  it('keeps the selected row and transaction active until handler settles, including abort', async () => {
    const { queue, events, rows } = fixture();
    const entered = deferred();
    const finish = deferred();
    const abort = new AbortController();
    const running = queue.listen(async () => {
      entered.resolve();
      await finish.promise;
    }, { signal: abort.signal });
    queue.resume();
    await entered.promise;
    expect(queue.snapshot().dequeueWork).toBe(1);
    abort.abort();
    queue.pause();
    expect(queue.snapshot().paused).toBe(false);
    expect(rows).toHaveLength(1);
    expect(events).toEqual(['BEGIN', 'SELECT']);
    finish.resolve();
    await running;
    expect(events).toEqual(['BEGIN', 'SELECT', 'DELETE', 'COMMIT']);
    expect(rows).toHaveLength(0);
    expect(queue.snapshot().paused).toBe(true);
  });
  it('rolls back failed delivery without discarding the message and blocks recovery', async () => {
    const { queue, events, rows } = fixture();
    const running = queue.listen(async () => {
      throw new Error('failed');
    });
    queue.resume();
    await running;
    expect(events).toEqual(['BEGIN', 'SELECT', 'ROLLBACK']);
    expect(rows).toHaveLength(1);
    expect(queue.snapshot().failed).toBe(true);
    expect(() => queue.resume()).toThrow();
  });
  it('counts delayed rows without processing them', async () => {
    const { queue, rows } = fixture();
    rows[0].due = false;
    const abort = new AbortController();
    const running = queue.listen(() => {
      throw new Error('must not run');
    }, { signal: abort.signal });
    queue.resume();
    await new Promise((resolve) => setTimeout(resolve, 5));
    queue.pause();
    abort.abort();
    await running;
    expect(await queue.depth()).toBe(1);
    expect(queue.snapshot().failed).toBe(false);
  });
  it('does not initialize or dequeue on frozen restart until explicitly resumed', async () => {
    const abort = new AbortController();
    let initialized = false;
    const queue = new ControlledQueue({
      initialize: async () => {
        initialized = true;
      },
      enqueue: async () => {},
      enqueueMany: async () => {},
      depth: async () => 0,
      transaction: async () => {},
    }, 1);
    const running = queue.listen(() => {}, { signal: abort.signal });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(initialized).toBe(false);
    abort.abort();
    await running;
  });

  it('keeps dequeue work active while a failed handler waits for sibling writes', async () => {
    const { queue, rows } = fixture();
    const entered = deferred();
    const sibling = deferred();
    const running = queue.listen(async () => {
      entered.resolve();
      await settleAll([Promise.reject(new Error('failed')), sibling.promise]);
    });
    queue.resume();
    await entered.promise;
    await Promise.resolve();
    expect(queue.snapshot().dequeueWork).toBe(1);
    expect(rows).toHaveLength(1);
    sibling.resolve();
    await running;
    expect(queue.snapshot()).toMatchObject({ dequeueWork: 0, failed: true });
    expect(rows).toHaveLength(1);
  });
  it('counts the selection gap, commit wait and all enqueues', async () => {
    const selected = deferred();
    const select = deferred();
    const commit = deferred();
    const enqueued = deferred();
    const queue = new ControlledQueue({
      initialize: async () => {},
      depth: async () => 0,
      enqueue: () => enqueued.promise,
      enqueueMany: () => enqueued.promise,
      transaction: async (run) => {
        await run({
          take: async () => {
            selected.resolve();
            await select.promise;
            return undefined;
          },
          remove: async () => {},
        });
        await commit.promise;
      },
    }, 1);
    const abort = new AbortController();
    const running = queue.listen(() => {}, { signal: abort.signal });
    queue.resume();
    await selected.promise;
    expect(queue.snapshot().dequeueWork).toBe(1);
    abort.abort();
    queue.pause();
    select.resolve();
    await Promise.resolve();
    expect(queue.snapshot().dequeueWork).toBe(1);
    const one = queue.enqueue({});
    const many = queue.enqueueMany([{}, {}]);
    expect(queue.snapshot().enqueueWork).toBe(2);
    commit.resolve();
    await running;
    expect(queue.snapshot().dequeueWork).toBe(0);
    enqueued.resolve();
    await Promise.all([one, many]);
    expect(queue.snapshot().enqueueWork).toBe(0);
  });
});
