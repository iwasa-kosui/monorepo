import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyRepostDeletedStore } from '../../../domain/blueskyTimeline/blueskyRepost.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyRepostsTable } from '../schema.ts';

export const createD1BlueskyRepostDeletedStore = (db: IoriD1Db, userId: UserId): BlueskyRepostDeletedStore => ({
  deleteBySubjectUri: async (subjectUri) => {
    await db.delete(blueskyRepostsTable).where(
      and(eq(blueskyRepostsTable.userId, userId), eq(blueskyRepostsTable.subjectUri, subjectUri)),
    );
    return RA.ok(undefined);
  },
});
