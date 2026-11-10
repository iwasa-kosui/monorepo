import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyLikeDeletedStore } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLikesTable } from '../schema.ts';

export const createD1BlueskyLikeDeletedStore = (db: IoriD1Db): BlueskyLikeDeletedStore => ({
  deleteBySubjectUri: async (subjectUri) => {
    await db.delete(blueskyLikesTable).where(eq(blueskyLikesTable.subjectUri, subjectUri));
    return RA.ok(undefined);
  },
});
