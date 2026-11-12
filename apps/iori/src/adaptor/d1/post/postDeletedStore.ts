import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PostDeletedStore } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import {
  directPostParticipantsTable,
  domainEventsTable,
  localPostsTable,
  postImagesTable,
  postQuotesTable,
  postsTable,
  remotePostPollsTable,
  remotePostRecipientsTable,
  remotePostsTable,
} from '../schema.ts';

export const createD1PostDeletedStore = (db: IoriD1Db): PostDeletedStore => ({
  store: async (event) => {
    await db.batch([
      db.delete(postImagesTable).where(eq(postImagesTable.postId, event.eventPayload.postId)),
      db.delete(postQuotesTable).where(eq(postQuotesTable.postId, event.eventPayload.postId)),
      db.delete(remotePostPollsTable).where(eq(remotePostPollsTable.postId, event.eventPayload.postId)),
      db.delete(localPostsTable).where(eq(localPostsTable.postId, event.eventPayload.postId)),
      db.delete(directPostParticipantsTable).where(eq(directPostParticipantsTable.postId, event.eventPayload.postId)),
      db.delete(remotePostRecipientsTable).where(eq(remotePostRecipientsTable.postId, event.eventPayload.postId)),
      db.delete(remotePostsTable).where(eq(remotePostsTable.postId, event.eventPayload.postId)),
      db.delete(postsTable).where(eq(postsTable.postId, event.eventPayload.postId)),
      db.insert(domainEventsTable).values({
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateName: event.aggregateName,
        aggregateState: null,
        eventName: event.eventName,
        eventPayload: JSON.stringify(event.eventPayload),
        occurredAt: new Date(event.occurredAt),
      }),
    ]);
    return RA.ok(undefined);
  },
});
