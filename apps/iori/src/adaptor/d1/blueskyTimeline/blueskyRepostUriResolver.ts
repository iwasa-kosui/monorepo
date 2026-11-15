import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyRepostUriResolver } from '../../../domain/blueskyTimeline/blueskyRepost.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyRepostsTable } from '../schema.ts';

export const createD1BlueskyRepostUriResolver = (db: IoriD1Db, userId: UserId): BlueskyRepostUriResolver => ({
  resolve: async (subjectUri) => {
    const [row] = await db.select({ repostUri: blueskyRepostsTable.repostUri })
      .from(blueskyRepostsTable)
      .where(and(eq(blueskyRepostsTable.userId, userId), eq(blueskyRepostsTable.subjectUri, subjectUri)))
      .limit(1);
    return RA.ok(row?.repostUri ?? null);
  },
});
