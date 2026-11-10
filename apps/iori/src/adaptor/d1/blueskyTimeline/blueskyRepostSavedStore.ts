import { RA } from '@iwasa-kosui/result';

import type { BlueskyRepostSavedStore } from '../../../domain/blueskyTimeline/blueskyRepost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyRepostsTable } from '../schema.ts';

export const createD1BlueskyRepostSavedStore = (db: IoriD1Db): BlueskyRepostSavedStore => ({
  save: async ({ subjectUri, repostUri, createdAt }) => {
    await db.insert(blueskyRepostsTable)
      .values({ subjectUri, repostUri, createdAt: new Date(createdAt) })
      .onConflictDoNothing();
    return RA.ok(undefined);
  },
});
