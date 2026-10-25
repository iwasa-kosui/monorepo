import { PostgresMessageQueue } from '@fedify/postgres';
import type { Sql } from 'postgres';
import { z } from 'zod';

import type { QueueStorage } from './controlledQueue.ts';

const rowSchema = z.object({ id: z.string().uuid(), message: z.unknown() });
const depthSchema = z.coerce.number().int().nonnegative().safe();

export function postgresQueueStorage(enqueueSql: Sql, transactionSql: Sql): QueueStorage {
  const base = new PostgresMessageQueue(enqueueSql);
  return {
    initialize: () => base.initialize(),
    enqueue: (message, options) => base.enqueue(message, options),
    enqueueMany: (messages, options) => base.enqueueMany(messages, options),
    depth: async () => {
      const [row] = await enqueueSql`SELECT count(*) AS depth FROM fedify_message_v2`;
      return depthSchema.parse(row?.depth);
    },
    transaction: async (run) => {
      // Dedicated max:1 pool: begin resolves only after COMMIT (or ROLLBACK on rejection).
      await transactionSql.begin(async (sql) => {
        await run({
          take: async () => {
            const [row] = await sql`
              SELECT id, message FROM fedify_message_v2
              WHERE created + delay < CURRENT_TIMESTAMP
              ORDER BY created LIMIT 1 FOR UPDATE SKIP LOCKED
            `;
            return row === undefined ? undefined : rowSchema.parse(row);
          },
          remove: async (id) => {
            await sql`DELETE FROM fedify_message_v2 WHERE id = ${id}`;
          },
        });
      });
    },
  };
}
