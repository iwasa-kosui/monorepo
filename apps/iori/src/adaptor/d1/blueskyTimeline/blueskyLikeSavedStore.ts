import { RA } from '@iwasa-kosui/result';

import type { BlueskyLikeSavedStore } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLikesTable } from '../schema.ts';

export const createD1BlueskyLikeSavedStore = (db: IoriD1Db): BlueskyLikeSavedStore => ({
  save: async ({ subjectUri, likeUri, createdAt }) => {
    await db.insert(blueskyLikesTable)
      .values({ subjectUri, likeUri, createdAt: new Date(createdAt) })
      .onConflictDoNothing();
    return RA.ok(undefined);
  },
});
