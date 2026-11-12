import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import type { RemotePostPollUpdatedStore } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, remotePostPollsTable, remotePostsTable } from '../schema.ts';

export const createD1RemotePostPollUpdatedStore = (db: IoriD1Db): RemotePostPollUpdatedStore => ({
  store: async (...events) => {
    const [first, ...rest] = events.flatMap((event) => {
      const { postId, poll } = event.eventPayload;
      const guard = sql`exists (select 1 from ${remotePostsTable} where ${remotePostsTable.postId} = ${postId})`;
      return [
        db.insert(remotePostPollsTable).select(sql`
          select ${postId}, ${poll.multiple ? 1 : 0}, ${JSON.stringify(poll.options)}, ${poll.votersCount},
            ${poll.expiresAt}, ${poll.closed ? 1 : 0}
          where ${guard}
        `).onConflictDoUpdate({
          target: remotePostPollsTable.postId,
          set: {
            multiple: sql`excluded.multiple`,
            options: sql`excluded.options`,
            votersCount: sql`excluded.votersCount`,
            expiresAt: sql`excluded.expiresAt`,
            closed: sql`excluded.closed`,
          },
        }),
        db.insert(domainEventsTable).select(sql`
          select ${event.eventId}, ${event.aggregateId}, ${event.aggregateName}, ${
          JSON.stringify(event.aggregateState)
        },
            ${event.eventName}, ${JSON.stringify(event.eventPayload)}, ${event.occurredAt}
          where ${guard}
        `),
      ];
    });
    if (first !== undefined) await db.batch([first, ...rest]);
    return RA.ok(undefined);
  },
});
