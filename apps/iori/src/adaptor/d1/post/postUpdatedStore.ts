import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PostUpdatedStore } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { directPostParticipantsTable, domainEventsTable, localPostsTable, postsTable } from '../schema.ts';
import { RECIPIENT_ROWS_PER_INSERT } from './postCreatedStore.ts';

export const createD1PostUpdatedStore = (db: IoriD1Db): PostUpdatedStore => ({
  store: async (...events) => {
    const statements = events.flatMap((event) => {
      const { postId, content, summary, sensitive, sourceText, participantActorUris, editedAt } = event.eventPayload;
      const participantInserts = [];
      for (let i = 0; i < participantActorUris.length; i += RECIPIENT_ROWS_PER_INSERT) {
        participantInserts.push(
          db.insert(directPostParticipantsTable).values(
            participantActorUris.slice(i, i + RECIPIENT_ROWS_PER_INSERT).map((actorUri) => ({ postId, actorUri })),
          ).onConflictDoNothing(),
        );
      }
      return [
        db.update(postsTable).set({ content, summary, sensitive }).where(eq(postsTable.postId, postId)),
        db.update(localPostsTable).set({ sourceText, editedAt: new Date(editedAt) }).where(
          eq(localPostsTable.postId, postId),
        ),
        ...participantInserts,
        db.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: event.aggregateId,
          aggregateName: event.aggregateName,
          aggregateState: JSON.stringify(event.aggregateState),
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        }),
      ];
    });
    const [first, ...rest] = statements;
    if (first === undefined) {
      return RA.ok(undefined);
    }
    await db.batch([first, ...rest]);
    return RA.ok(undefined);
  },
});
