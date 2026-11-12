import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PostUpdatedStore } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, localPostsTable, postsTable } from '../schema.ts';

export const createD1PostUpdatedStore = (db: IoriD1Db): PostUpdatedStore => ({
  store: async (...events) => {
    for (const event of events) {
      const { postId, content, summary, sensitive, sourceText, editedAt } = event.eventPayload;
      await db.batch([
        db.update(postsTable).set({ content, summary, sensitive }).where(eq(postsTable.postId, postId)),
        db.update(localPostsTable).set({ sourceText, editedAt: new Date(editedAt) }).where(
          eq(localPostsTable.postId, postId),
        ),
        db.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: event.aggregateId,
          aggregateName: event.aggregateName,
          aggregateState: JSON.stringify(event.aggregateState),
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        }),
      ]);
    }
    return RA.ok(undefined);
  },
});
