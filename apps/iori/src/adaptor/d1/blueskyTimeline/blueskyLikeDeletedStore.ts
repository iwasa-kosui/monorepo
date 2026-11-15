import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyLikeDeletedStore } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLikesTable } from '../schema.ts';

export const createD1BlueskyLikeDeletedStore = (db: IoriD1Db, userId: UserId): BlueskyLikeDeletedStore => ({
  deleteBySubjectUri: async (subjectUri) => {
    await db.delete(blueskyLikesTable).where(
      and(eq(blueskyLikesTable.userId, userId), eq(blueskyLikesTable.subjectUri, subjectUri)),
    );
    return RA.ok(undefined);
  },
});
