import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyBookmarkDeletedStore } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyBookmarksTable } from '../schema.ts';

export const createD1BlueskyBookmarkDeletedStore = (db: IoriD1Db, userId: UserId): BlueskyBookmarkDeletedStore => ({
  deleteBySubjectUri: async (subjectUri) => {
    await db.delete(blueskyBookmarksTable).where(and(eq(blueskyBookmarksTable.userId, userId), eq(blueskyBookmarksTable.subjectUri, subjectUri)));
    return RA.ok(undefined);
  },
});
