import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PostDeleted, PostDeletedStore } from '../../../domain/post/post.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, localPostsTable, postImagesTable, postsTable, remotePostsTable } from '../schema.ts';

const store = async (event: PostDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    const { postId } = event.eventPayload;
    // Delete related records first (foreign key constraints)
    await tx.delete(postImagesTable).where(eq(postImagesTable.postId, postId));
    await tx.delete(localPostsTable).where(eq(localPostsTable.postId, postId));
    await tx
      .delete(remotePostsTable)
      .where(eq(remotePostsTable.postId, postId));
    // Delete the post
    await tx.delete(postsTable).where(eq(postsTable.postId, postId));
    // Record the event
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): PostDeletedStore => ({
    store,
  }),
);

export const PgPostDeletedStore = {
  getInstance,
} as const;
