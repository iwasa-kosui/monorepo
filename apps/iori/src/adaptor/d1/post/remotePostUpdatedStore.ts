import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RemotePostUpdatedStore } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, postsTable, remotePostRecipientsTable, remotePostsTable } from '../schema.ts';
import { RECIPIENT_ROWS_PER_INSERT } from './postCreatedStore.ts';

export const createD1RemotePostUpdatedStore = (db: IoriD1Db): RemotePostUpdatedStore => ({
  store: async (event) => {
    const post = event.aggregateState;
    const { recipientActorUris } = event.eventPayload;
    const recipientInserts = [];
    for (let i = 0; i < recipientActorUris.length; i += RECIPIENT_ROWS_PER_INSERT) {
      recipientInserts.push(
        db.insert(remotePostRecipientsTable).values(
          recipientActorUris.slice(i, i + RECIPIENT_ROWS_PER_INSERT).map((actorUri) => ({
            postId: post.postId,
            actorUri,
          })),
        ),
      );
    }
    await db.batch([
      db.update(postsTable)
        .set({ content: post.content, summary: post.summary, sensitive: post.sensitive })
        .where(eq(postsTable.postId, post.postId)),
      db.update(remotePostsTable)
        .set({ editedAt: post.editedAt === undefined || post.editedAt === null ? null : new Date(post.editedAt) })
        .where(eq(remotePostsTable.postId, post.postId)),
      db.delete(remotePostRecipientsTable).where(eq(remotePostRecipientsTable.postId, post.postId)),
      ...recipientInserts,
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
    return RA.ok(undefined);
  },
});
