import { RA } from '@iwasa-kosui/result';

import type { BlueskyBookmarkSavedStore } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyBookmarksTable } from '../schema.ts';

export const createD1BlueskyBookmarkSavedStore = (db: IoriD1Db): BlueskyBookmarkSavedStore => ({
  save: async ({ subjectUri, createdAt }) => {
    await db.insert(blueskyBookmarksTable)
      .values({ subjectUri, createdAt: new Date(createdAt) })
      .onConflictDoNothing();
    return RA.ok(undefined);
  },
});
