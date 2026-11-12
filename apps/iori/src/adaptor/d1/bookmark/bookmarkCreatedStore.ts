import { RA } from '@iwasa-kosui/result';

import { AlreadyBookmarkedError, type BookmarkCreatedStore } from '../../../domain/bookmark/bookmark.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { bookmarksTable, domainEventsTable } from '../schema.ts';

const actorPostUniqueViolation = 'UNIQUE constraint failed: bookmarks.actorId, bookmarks.postId';

const isActorPostUniqueViolation = (error: unknown): boolean => {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes(actorPostUniqueViolation)) return true;
  }
  return false;
};

export const createD1BookmarkCreatedStore = (db: IoriD1Db): BookmarkCreatedStore => ({
  store: async (event) => {
    try {
      await db.batch([
        db.insert(bookmarksTable).values({ ...event.aggregateState, createdAt: new Date(event.occurredAt) }),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    } catch (error) {
      if (!isActorPostUniqueViolation(error)) throw error;
      const { actorId, postId } = event.aggregateState;
      return RA.err(AlreadyBookmarkedError.create({ actorId, postId }));
    }
    return RA.ok(undefined);
  },
});
