import { RA } from '@iwasa-kosui/result';

import type { BlueskyLikeSavedStore } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLikesTable } from '../schema.ts';

export const createD1BlueskyLikeSavedStore = (db: IoriD1Db): BlueskyLikeSavedStore => ({
  save: async ({ subjectUri, likeUri, createdAt }) => {
    const values = { likeUri, createdAt: new Date(createdAt) };
    await db.insert(blueskyLikesTable)
      .values({ subjectUri, ...values })
      .onConflictDoUpdate({ target: blueskyLikesTable.subjectUri, set: values });
    return RA.ok(undefined);
  },
});
