import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyLikeUriResolver } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLikesTable } from '../schema.ts';

export const createD1BlueskyLikeUriResolver = (db: IoriD1Db): BlueskyLikeUriResolver => ({
  resolve: async (subjectUri) => {
    const [row] = await db.select({ likeUri: blueskyLikesTable.likeUri })
      .from(blueskyLikesTable)
      .where(eq(blueskyLikesTable.subjectUri, subjectUri))
      .limit(1);
    return RA.ok(row?.likeUri ?? null);
  },
});
