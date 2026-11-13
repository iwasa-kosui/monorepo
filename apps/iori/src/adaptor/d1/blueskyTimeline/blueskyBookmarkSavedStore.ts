import { RA } from '@iwasa-kosui/result';

import type { BlueskyBookmarkSavedStore } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyBookmarksTable } from '../schema.ts';

export const createD1BlueskyBookmarkSavedStore = (db: IoriD1Db): BlueskyBookmarkSavedStore => ({
  save: async ({ subjectUri, createdAt }) => {
    const values = { createdAt: new Date(createdAt) };
    await db.insert(blueskyBookmarksTable)
      .values({ subjectUri, ...values })
      .onConflictDoUpdate({ target: blueskyBookmarksTable.subjectUri, set: values });
    return RA.ok(undefined);
  },
});
