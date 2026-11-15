import { RA } from '@iwasa-kosui/result';

import type { BlueskyBookmarkSavedStore } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyBookmarksTable } from '../schema.ts';

export const createD1BlueskyBookmarkSavedStore = (db: IoriD1Db, userId: UserId): BlueskyBookmarkSavedStore => ({
  save: async ({ subjectUri, createdAt }) => {
    const values = { createdAt: new Date(createdAt) };
    await db.insert(blueskyBookmarksTable)
      .values({ userId, subjectUri, ...values })
      .onConflictDoUpdate({ target: [blueskyBookmarksTable.userId, blueskyBookmarksTable.subjectUri], set: values });
    return RA.ok(undefined);
  },
});
