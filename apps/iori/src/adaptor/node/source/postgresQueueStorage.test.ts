import type { Sql } from 'postgres';
import { expect, it } from 'vitest';

import { ControlledQueue } from './controlledQueue.ts';
import { postgresQueueStorage } from './postgresQueueStorage.ts';

it('uses a locked due-row SELECT and commits deletion only after delivery on the dedicated SQL connection', async () => {
  const statements: string[] = [];
  const entered = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const id = 'f074218c-2fa7-4867-9a01-a80b28ff1fd3';
  const enqueueSql = async (parts: TemplateStringsArray) => {
    const sql = parts.join('?').replace(/\s+/g, ' ').trim();
    expect(sql).toBe('SELECT count(*) AS depth FROM fedify_message_v2');
    return [{ depth: '1' }];
  };
  const transactionSql = {
    begin: async (run: (sql: unknown) => Promise<void>) => {
      statements.push('BEGIN');
      try {
        await run(async (parts: TemplateStringsArray, ...values: unknown[]) => {
          const sql = parts.join('?').replace(/\s+/g, ' ').trim();
          statements.push(sql);
          if (sql.startsWith('SELECT')) {
            expect(sql).toBe(
              'SELECT id, message FROM fedify_message_v2 WHERE created + delay < CURRENT_TIMESTAMP ORDER BY created LIMIT 1 FOR UPDATE SKIP LOCKED',
            );
            return [{ id, message: { type: 'inbox' } }];
          }
          expect(sql).toBe('DELETE FROM fedify_message_v2 WHERE id = ?');
          expect(values).toEqual([id]);
          return [];
        });
        statements.push('COMMIT');
      } catch (error) {
        statements.push('ROLLBACK');
        throw error;
      }
    },
  };
  // Only the external SQL transport is replaced; production SQL construction and queue sequencing run unchanged.
  const storage = postgresQueueStorage(enqueueSql as unknown as Sql, transactionSql as unknown as Sql);
  const queue = new ControlledQueue({ ...storage, initialize: async () => {} }, 1);
  const abort = new AbortController();
  const running = queue.listen(async (message) => {
    expect(message).toEqual({ type: 'inbox' });
    entered.resolve();
    await finish.promise;
  }, { signal: abort.signal });
  queue.resume();
  await entered.promise;
  expect(await queue.depth()).toBe(1);
  expect(statements).toHaveLength(2);
  expect(queue.snapshot().dequeueWork).toBe(1);
  abort.abort();
  finish.resolve();
  await running;
  expect(statements.at(-2)).toBe('DELETE FROM fedify_message_v2 WHERE id = ?');
  expect(statements.at(-1)).toBe('COMMIT');
});
