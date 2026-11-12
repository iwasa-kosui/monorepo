import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyBookmarkDeletedStore } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyBookmarksTable } from '../schema.ts';

export const createD1BlueskyBookmarkDeletedStore = (db: IoriD1Db): BlueskyBookmarkDeletedStore => ({
  deleteBySubjectUri: async (subjectUri) => {
    await db.delete(blueskyBookmarksTable).where(eq(blueskyBookmarksTable.subjectUri, subjectUri));
    return RA.ok(undefined);
  },
});
